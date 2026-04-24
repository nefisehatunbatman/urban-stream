package main

import (
	"log"
	"net/http"

	"auth-service/internal/config"
	"auth-service/internal/handler"
	"auth-service/internal/repository/database"
	"auth-service/internal/routes"
	"auth-service/internal/service/commands"
	"auth-service/internal/service/queries"
)

func main() {
	// 1. Config
	cfg := config.Load()

	// 2. PostgreSQL
	db := database.NewPostgresDB(cfg)
	defer db.Close()

	// 3. Migration
	database.RunMigrations(db)

	// 4. JWT Service (RS256)
	jwtService, err := commands.NewJWTService(
		cfg.PrivateKeyPath,
		cfg.PublicKeyPath,
		cfg.AccessTokenMinutes,
	)
	if err != nil {
		log.Fatalf("JWT servisi başlatılamadı: %v", err)
	}

	// 5. Commands & Queries
	authCommands := commands.NewAuthCommands(db, jwtService, cfg.RefreshTokenDays)
	authQueries := queries.NewAuthQueries(db)

	// 6. Handler
	authHandler := handler.NewAuthHandler(authCommands, authQueries)

	// 7. Router
	router := routes.Setup(authHandler, jwtService)

	// 8. Server
	addr := ":" + cfg.Port
	log.Printf("Auth servisi başlatılıyor: %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("Sunucu başlatılamadı: %v", err)
	}
}
