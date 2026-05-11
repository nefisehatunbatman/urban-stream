package queries

import (
	"database/sql"
	"fmt"

	"auth-service/internal/dto"
)

type AuthQueries struct {
	db *sql.DB
}

func NewAuthQueries(db *sql.DB) *AuthQueries {
	return &AuthQueries{db: db}
}

func (q *AuthQueries) GetMe(userID string) (*dto.MeResponse, error) {
	var me dto.MeResponse
	err := q.db.QueryRow(`
		SELECT u.id, u.email, COALESCE(u.full_name, ''), r.name
		FROM users u
		JOIN roles r ON r.id = u.role_id
		WHERE u.id = $1 AND u.is_active = TRUE
	`, userID).Scan(&me.ID, &me.Email, &me.FullName, &me.Role)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("kullanıcı bulunamadı")
	}
	if err != nil {
		return nil, err
	}

	perms, err := q.GetPermissions(userID) // ← değişti (küçük g → büyük G)
	if err != nil {
		return nil, err
	}
	me.Permissions = perms
	return &me, nil
}

func (q *AuthQueries) ListUsers() ([]dto.UserResponse, error) {
	rows, err := q.db.Query(`
		SELECT u.id, u.email, COALESCE(u.full_name, ''), r.name, u.is_active,
		       TO_CHAR(u.created_at, 'YYYY-MM-DD HH24:MI:SS')
		FROM users u
		JOIN roles r ON r.id = u.role_id
		ORDER BY u.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []dto.UserResponse
	for rows.Next() {
		var u dto.UserResponse
		rows.Scan(&u.ID, &u.Email, &u.FullName, &u.Role, &u.IsActive, &u.CreatedAt)
		users = append(users, u)
	}
	return users, nil
}

func (q *AuthQueries) ListRoles() ([]map[string]interface{}, error) {
	rows, err := q.db.Query(`
		SELECT r.id, r.name,
		       ARRAY_AGG(p.name ORDER BY p.name) as permissions
		FROM roles r
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		LEFT JOIN permissions p ON p.id = rp.permission_id
		GROUP BY r.id, r.name
		ORDER BY r.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []map[string]interface{}
	for rows.Next() {
		var id int
		var name string
		var perms []byte
		rows.Scan(&id, &name, &perms)
		roles = append(roles, map[string]interface{}{
			"id":          id,
			"name":        name,
			"permissions": string(perms),
		})
	}
	return roles, nil
}

// GetPermissions — önce user_permissions bakar; kayıt varsa onu döndürür,
// yoksa role_permissions'a fallback yapar. (Export edildi — middleware tarafından kullanılır)
func (q *AuthQueries) GetPermissions(userID string) ([]string, error) {
	// 1) Kullanıcıya özel izinler
	userRows, err := q.db.Query(`
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
	roleRows, err := q.db.Query(`
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
