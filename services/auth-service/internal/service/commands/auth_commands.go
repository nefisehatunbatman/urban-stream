package commands

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"auth-service/internal/dto"

	"golang.org/x/crypto/bcrypt"
)

type AuthCommands struct {
	db         *sql.DB
	jwtService *JWTService
	refreshTTL time.Duration
}

func NewAuthCommands(db *sql.DB, jwtService *JWTService, refreshDays int) *AuthCommands {
	return &AuthCommands{
		db:         db,
		jwtService: jwtService,
		refreshTTL: time.Duration(refreshDays) * 24 * time.Hour,
	}
}

func (c *AuthCommands) Register(req dto.RegisterRequest, isAdmin bool) (*dto.TokenResponse, error) {
	// Email var mı?
	var exists bool
	err := c.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)", req.Email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("db hatası: %w", err)
	}
	if exists {
		return nil, errors.New("bu email zaten kayıtlı")
	}

	// Şifreyi hashle
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("şifre hashlenemedi: %w", err)
	}

	// Rol belirle: admin ise gelen role_id'yi kullan, değilse viewer (3)
	roleID := 3
	if isAdmin && req.RoleID > 0 {
		roleID = req.RoleID
	}

	// Kullanıcıyı kaydet
	var userID string
	err = c.db.QueryRow(
		`INSERT INTO users (email, password_hash, full_name, role_id) VALUES ($1, $2, $3, $4) RETURNING id`,
		req.Email, string(hash), req.FullName, roleID,
	).Scan(&userID)
	if err != nil {
		return nil, fmt.Errorf("kullanıcı kaydedilemedi: %w", err)
	}

	// Admin özel izin listesi gönderdiyse user_permissions'a kaydet
	if isAdmin && len(req.Permissions) > 0 {
		if err = c.saveUserPermissions(userID, req.Permissions); err != nil {
			// Kayıt başarısız olsa bile devam et, rol izinlerine düşer
			fmt.Printf("[warn] user_permissions kaydedilemedi: %v\n", err)
		}
	}

	// Atanan rolün adını DB'den çek
	var roleName string
	c.db.QueryRow(`SELECT name FROM roles WHERE id=$1`, roleID).Scan(&roleName)
	if roleName == "" {
		roleName = "viewer"
	}
	perms, err := c.getUserPermissions(userID)
	if err != nil {
		perms = []string{}
	}

	return c.generateTokenPair(userID, req.Email, roleName, roleID, perms)
}

func (c *AuthCommands) Login(req dto.LoginRequest) (*dto.TokenResponse, error) {
	var (
		userID       string
		passwordHash string
		roleName     string
		roleID       int
		isActive     bool
	)

	err := c.db.QueryRow(`
		SELECT u.id, u.password_hash, r.name, u.role_id, u.is_active
		FROM users u
		JOIN roles r ON r.id = u.role_id
		WHERE u.email = $1
	`, req.Email).Scan(&userID, &passwordHash, &roleName, &roleID, &isActive)

	if err == sql.ErrNoRows {
		return nil, errors.New("email veya şifre hatalı")
	}
	if err != nil {
		return nil, fmt.Errorf("db hatası: %w", err)
	}
	if !isActive {
		return nil, errors.New("hesap devre dışı")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("email veya şifre hatalı")
	}

	permissions, err := c.getUserPermissions(userID)
	if err != nil {
		return nil, err
	}

	return c.generateTokenPair(userID, req.Email, roleName, roleID, permissions)
}

func (c *AuthCommands) Refresh(req dto.RefreshRequest) (*dto.TokenResponse, error) {
	tokenHash := hashToken(req.RefreshToken)

	var (
		userID    string
		email     string
		roleName  string
		roleID    int
		expiresAt time.Time
	)

	err := c.db.QueryRow(`
		SELECT u.id, u.email, r.name, u.role_id, rt.expires_at
		FROM refresh_tokens rt
		JOIN users u ON u.id = rt.user_id
		JOIN roles r ON r.id = u.role_id
		WHERE rt.token_hash = $1 AND u.is_active = TRUE
	`, tokenHash).Scan(&userID, &email, &roleName, &roleID, &expiresAt)

	if err == sql.ErrNoRows {
		return nil, errors.New("geçersiz refresh token")
	}
	if err != nil {
		return nil, fmt.Errorf("db hatası: %w", err)
	}
	if time.Now().After(expiresAt) {
		return nil, errors.New("refresh token süresi dolmuş")
	}

	// Eski token'ı sil
	c.db.Exec("DELETE FROM refresh_tokens WHERE token_hash = $1", tokenHash)

	permissions, err := c.getUserPermissions(userID)
	if err != nil {
		return nil, err
	}

	return c.generateTokenPair(userID, email, roleName, roleID, permissions)
}

func (c *AuthCommands) Logout(refreshToken string) error {
	tokenHash := hashToken(refreshToken)
	_, err := c.db.Exec("DELETE FROM refresh_tokens WHERE token_hash = $1", tokenHash)
	return err
}

func (c *AuthCommands) AssignRole(targetUserID string, roleID int) error {
	_, err := c.db.Exec(
		"UPDATE users SET role_id = $1, updated_at = NOW() WHERE id = $2",
		roleID, targetUserID,
	)
	return err
}

// UpdateRolePermissions — bir rolün izin listesini tamamen değiştirir (transaction)
func (c *AuthCommands) UpdateRolePermissions(roleID int, permissions []string) error {
	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("transaction başlatılamadı: %w", err)
	}
	defer tx.Rollback()

	// Mevcut izinleri sil
	if _, err = tx.Exec(`DELETE FROM role_permissions WHERE role_id = $1`, roleID); err != nil {
		return fmt.Errorf("eski izinler silinemedi: %w", err)
	}

	// Yeni izinleri ekle (name → id çevirisi)
	for _, permName := range permissions {
		var permID int
		if err = tx.QueryRow(`SELECT id FROM permissions WHERE name = $1`, permName).Scan(&permID); err != nil {
			return fmt.Errorf("izin bulunamadı '%s': %w", permName, err)
		}
		if _, err = tx.Exec(
			`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			roleID, permID,
		); err != nil {
			return fmt.Errorf("izin eklenemedi '%s': %w", permName, err)
		}
	}

	return tx.Commit()
}

// CreateRole — Yeni bir rol oluşturur ve izinlerini atar
func (c *AuthCommands) CreateRole(name string, permissions []string) (int, error) {
	var roleID int
	err := c.db.QueryRow(`INSERT INTO roles (name) VALUES ($1) RETURNING id`, name).Scan(&roleID)
	if err != nil {
		return 0, fmt.Errorf("rol oluşturulamadı: %w", err)
	}

	if err := c.UpdateRolePermissions(roleID, permissions); err != nil {
		return roleID, fmt.Errorf("rol oluşturuldu ancak izinler eklenemedi: %w", err)
	}

	return roleID, nil
}

// UpdateUserPermissions — Kullanıcıya özel izinleri günceller
func (c *AuthCommands) UpdateUserPermissions(userID string, permissions []string) error {
	return c.saveUserPermissions(userID, permissions)
}

// UpdateUser — Kullanıcı adını ve şifresini günceller (şifre boş değilse)
func (c *AuthCommands) UpdateUser(userID string, fullName, password string) error {
	if password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("şifre hashlenemedi: %w", err)
		}
		_, err = c.db.Exec(`UPDATE users SET full_name = $1, password_hash = $2, updated_at = NOW() WHERE id = $3`, fullName, string(hash), userID)
		return err
	}
	
	_, err := c.db.Exec(`UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`, fullName, userID)
	return err
}

// DeleteUser — kullanıcıyı ve ilişkili refresh token'larını siler
func (c *AuthCommands) DeleteUser(userID string) error {
	_, err := c.db.Exec(`DELETE FROM users WHERE id = $1`, userID)
	return err
}

// --- Yardımcı fonksiyonlar ---

func (c *AuthCommands) generateTokenPair(userID, email, role string, roleID int, permissions []string) (*dto.TokenResponse, error) {
	accessToken, err := c.jwtService.GenerateAccessToken(userID, email, role, roleID, permissions)
	if err != nil {
		return nil, fmt.Errorf("access token üretilemedi: %w", err)
	}

	// Refresh token: random UUID benzeri string
	rawRefresh := fmt.Sprintf("%s-%s-%d", userID, email, time.Now().UnixNano())
	tokenHash := hashToken(rawRefresh)

	_, err = c.db.Exec(
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, tokenHash, time.Now().Add(c.refreshTTL),
	)
	if err != nil {
		return nil, fmt.Errorf("refresh token kaydedilemedi: %w", err)
	}

	return &dto.TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		ExpiresIn:    c.jwtService.AccessTTLSeconds(),
	}, nil
}

// getUserPermissions — önce user_permissions bakar; kayıt varsa onu döndürür,
// yoksa role_permissions'a fallback yapar.
func (c *AuthCommands) getUserPermissions(userID string) ([]string, error) {
	// 1) Kullanıcıya özel izinler
	userRows, err := c.db.Query(`
		SELECT p.name
		FROM permissions p
		JOIN user_permissions up ON up.permission_id = p.id
		WHERE up.user_id = $1
		ORDER BY p.name
	`, userID)
	if err != nil {
		return nil, err
	}
	defer userRows.Close()

	var perms []string
	for userRows.Next() {
		var p string
		userRows.Scan(&p)
		perms = append(perms, p)
	}

	// Kullanıcıya özel izin varsa — rol izinlerini atla
	if len(perms) > 0 {
		return perms, nil
	}

	// 2) Fallback: rol üzerinden izinler
	roleRows, err := c.db.Query(`
		SELECT p.name
		FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		JOIN users u ON u.role_id = rp.role_id
		WHERE u.id = $1
		ORDER BY p.name
	`, userID)
	if err != nil {
		return nil, err
	}
	defer roleRows.Close()

	for roleRows.Next() {
		var p string
		roleRows.Scan(&p)
		perms = append(perms, p)
	}
	return perms, nil
}

// saveUserPermissions — user_permissions tablosuna transaction ile yazar (mevcut kayıtları temizler)
func (c *AuthCommands) saveUserPermissions(userID string, permissions []string) error {
	tx, err := c.db.Begin()
	if err != nil {
		return fmt.Errorf("transaction başlatılamadı: %w", err)
	}
	defer tx.Rollback()

	// Eskilerini temizle
	if _, err = tx.Exec(`DELETE FROM user_permissions WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("eski kullanıcı izinleri silinemedi: %w", err)
	}

	// Yenilerini ekle
	for _, permName := range permissions {
		var permID int
		if err = tx.QueryRow(`SELECT id FROM permissions WHERE name = $1`, permName).Scan(&permID); err != nil {
			return fmt.Errorf("izin bulunamadı '%s': %w", permName, err)
		}
		if _, err = tx.Exec(
			`INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			userID, permID,
		); err != nil {
			return fmt.Errorf("izin eklenemedi '%s': %w", permName, err)
		}
	}

	return tx.Commit()
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
