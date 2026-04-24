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

	perms, err := q.getPermissions(userID)
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

func (q *AuthQueries) getPermissions(userID string) ([]string, error) {
	rows, err := q.db.Query(`
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
