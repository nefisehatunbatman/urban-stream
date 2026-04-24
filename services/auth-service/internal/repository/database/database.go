package database

import (
	"database/sql"
	"fmt"
	"log"

	"auth-service/internal/config"

	_ "github.com/lib/pq"
)

func NewPostgresDB(cfg *config.Config) *sql.DB {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.PostgresHost,
		cfg.PostgresPort,
		cfg.PostgresUser,
		cfg.PostgresPassword,
		cfg.PostgresDB,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("PostgreSQL bağlantısı açılamadı: %v", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("PostgreSQL ping başarısız: %v", err)
	}

	log.Println("PostgreSQL bağlantısı başarılı")
	return db
}
