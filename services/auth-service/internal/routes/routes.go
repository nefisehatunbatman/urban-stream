package routes

import (
	"net/http"

	"auth-service/internal/handler"
	"auth-service/internal/middleware"
	"auth-service/internal/service/commands"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func Setup(h *handler.AuthHandler, jwtService *commands.JWTService) *chi.Mux {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Public routes
	r.Post("/auth/register", h.Register)
	r.Post("/auth/login", h.Login)
	r.Post("/auth/refresh", h.Refresh)
	r.Post("/auth/logout", h.Logout)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(jwtService))

		// Tüm giriş yapmış kullanıcılar
		r.Get("/auth/me", h.Me)

		// Sadece admin
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission("manage_users"))
			r.Get("/users", h.ListUsers)
			r.Put("/users/{id}/role", h.AssignRole)
		})

		// Admin veya operator
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission("assign_roles"))
			r.Get("/roles", h.ListRoles)
		})
	})

	return r
}
