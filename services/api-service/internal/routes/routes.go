package routes

import (
	"crypto/rsa"
	"net/http"

	"api-service/internal/handler"
	"api-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func Setup(h *handler.APIHandler, publicKey *rsa.PublicKey) *chi.Mux {
	r := chi.NewRouter()

	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Protected REST endpoints
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(publicKey))
		r.Use(middleware.RequirePermission("view_stats"))

		r.Get("/api/density", h.GetDensity)
		r.Get("/api/density/hourly", h.GetHourlyDensity)
		r.Get("/api/traffic-lights", h.GetTrafficLights)
		r.Get("/api/speed-violations", h.GetSpeedViolations)
		r.Get("/api/predictions", h.GetPredictions)
		r.Get("/api/analysis", h.GetAnalysis)
	})

	// WebSocket — view_map yetkisi gerekir
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(publicKey))
		r.Use(middleware.RequirePermission("view_map"))

		r.Get("/ws/live", h.LiveWS)
	})

	return r
}
