package database

import (
	"database/sql"
	"log"
)

func RunMigrations(db *sql.DB) {
	queries := []string{
		// Roller tablosu
		`CREATE TABLE IF NOT EXISTS roles (
			id         SERIAL PRIMARY KEY,
			name       VARCHAR(50) UNIQUE NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)`,

		// Yetkiler tablosu
		`CREATE TABLE IF NOT EXISTS permissions (
			id          SERIAL PRIMARY KEY,
			name        VARCHAR(100) UNIQUE NOT NULL,
			description TEXT,
			created_at  TIMESTAMP DEFAULT NOW()
		)`,

		// Rol → Yetki ilişkisi
		`CREATE TABLE IF NOT EXISTS role_permissions (
			role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
			permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
			PRIMARY KEY (role_id, permission_id)
		)`,

		// Kullanıcılar tablosu
		`CREATE TABLE IF NOT EXISTS users (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email         VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			full_name     VARCHAR(255),
			role_id       INT REFERENCES roles(id) DEFAULT 3,
			is_active     BOOLEAN DEFAULT TRUE,
			created_at    TIMESTAMP DEFAULT NOW(),
			updated_at    TIMESTAMP DEFAULT NOW()
		)`,

		// Refresh token tablosu
		`CREATE TABLE IF NOT EXISTS refresh_tokens (
			id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
			token_hash VARCHAR(255) NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		)`,

		// Varsayılan roller
		`INSERT INTO roles (name) VALUES ('admin'), ('operator'), ('viewer')
		 ON CONFLICT (name) DO NOTHING`,

		// Varsayılan yetkiler
		`INSERT INTO permissions (name, description) VALUES
			('manage_users',  'Kullanıcı oluşturma, silme, düzenleme'),
			('assign_roles',  'Kullanıcılara rol atama'),
			('create_report', 'Analiz raporu oluşturma'),
			('view_stats',    'İstatistik sayfalarını görüntüleme'),
			('view_map',      'Harita sayfasını görüntüleme')
		 ON CONFLICT (name) DO NOTHING`,

		// Admin → tüm yetkiler
		`INSERT INTO role_permissions (role_id, permission_id)
		 SELECT r.id, p.id FROM roles r, permissions p
		 WHERE r.name = 'admin'
		 ON CONFLICT DO NOTHING`,

		// Operator → create_report + view_stats + view_map
		`INSERT INTO role_permissions (role_id, permission_id)
		 SELECT r.id, p.id FROM roles r
		 JOIN permissions p ON p.name IN ('create_report', 'view_stats', 'view_map')
		 WHERE r.name = 'operator'
		 ON CONFLICT DO NOTHING`,

		// Viewer → view_stats + view_map
		`INSERT INTO role_permissions (role_id, permission_id)
		 SELECT r.id, p.id FROM roles r
		 JOIN permissions p ON p.name IN ('view_stats', 'view_map')
		 WHERE r.name = 'viewer'
		 ON CONFLICT DO NOTHING`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Fatalf("Migration hatası: %v\nQuery: %s", err, q)
		}
	}

	log.Println("Migration tamamlandı")
}
