package main

import (
	"log"
	"net/http"

	"api-service/internal/config"
	"api-service/internal/handler"
	"api-service/internal/middleware"
	"api-service/internal/repository/database"
	"api-service/internal/routes"
	"api-service/internal/service/commands"
	"api-service/internal/service/queries"
)

func main() {
	// 1. Config
	cfg := config.Load()

	// 2. ClickHouse
	db := database.NewClickHouseDB(cfg)

	// 3. Public key (JWT doğrulama)
	publicKey, err := middleware.LoadPublicKey(cfg.PublicKeyPath)
	if err != nil {
		log.Fatalf("Public key yüklenemedi: %v", err)
	}

	// 4. WebSocket Hub
	hub := commands.NewHub()
	go hub.Run()
	go hub.StartKafkaConsumer(cfg.KafkaBroker)

	// 5. Queries & Handler
	apiQueries := queries.NewAPIQueries(db)
	apiHandler := handler.NewAPIHandler(apiQueries, hub)

	// 6. Router
	router := routes.Setup(apiHandler, publicKey)

	// 7. Server
	addr := ":" + cfg.Port
	log.Printf("API servisi başlatılıyor: %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("Sunucu başlatılamadı: %v", err)
	}
}
