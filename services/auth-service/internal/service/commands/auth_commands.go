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

func (c *AuthCommands) Register(req dto.RegisterRequest) (*dto.TokenResponse, error) {
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

	// Kullanıcıyı kaydet (varsayılan rol: viewer = 3)
	var userID string
	err = c.db.QueryRow(
		`INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id`,
		req.Email, string(hash), req.FullName,
	).Scan(&userID)
	if err != nil {
		return nil, fmt.Errorf("kullanıcı kaydedilemedi: %w", err)
	}

	return c.generateTokenPair(userID, req.Email, "viewer", []string{"view_stats", "view_map"})
}

func (c *AuthCommands) Login(req dto.LoginRequest) (*dto.TokenResponse, error) {
	var (
		userID       string
		passwordHash string
		roleName     string
		isActive     bool
	)

	err := c.db.QueryRow(`
		SELECT u.id, u.password_hash, r.name, u.is_active
		FROM users u
		JOIN roles r ON r.id = u.role_id
		WHERE u.email = $1
	`, req.Email).Scan(&userID, &passwordHash, &roleName, &isActive)

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

	return c.generateTokenPair(userID, req.Email, roleName, permissions)
}

func (c *AuthCommands) Refresh(req dto.RefreshRequest) (*dto.TokenResponse, error) {
	tokenHash := hashToken(req.RefreshToken)

	var (
		userID    string
		email     string
		roleName  string
		expiresAt time.Time
	)

	err := c.db.QueryRow(`
		SELECT u.id, u.email, r.name, rt.expires_at
		FROM refresh_tokens rt
		JOIN users u ON u.id = rt.user_id
		JOIN roles r ON r.id = u.role_id
		WHERE rt.token_hash = $1 AND u.is_active = TRUE
	`, tokenHash).Scan(&userID, &email, &roleName, &expiresAt)

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

	return c.generateTokenPair(userID, email, roleName, permissions)
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

// --- Yardımcı fonksiyonlar ---

func (c *AuthCommands) generateTokenPair(userID, email, role string, permissions []string) (*dto.TokenResponse, error) {
	accessToken, err := c.jwtService.GenerateAccessToken(userID, email, role, permissions)
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

func (c *AuthCommands) getUserPermissions(userID string) ([]string, error) {
	rows, err := c.db.Query(`
		SELECT p.name
		FROM permissions p
		JOIN role_permissions rp ON rp.permission_id = p.id
		JOIN users u ON u.role_id = rp.role_id
		WHERE u.id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []string
	for rows.Next() {
		var p string
		rows.Scan(&p)
		perms = append(perms, p)
	}
	return perms, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
