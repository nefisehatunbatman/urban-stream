package routes

import (
	"net/http"

	"auth-service/internal/handler"
	"auth-service/internal/middleware"
	"auth-service/internal/service/commands"
	"auth-service/internal/service/queries"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func Setup(h *handler.AuthHandler, jwtService *commands.JWTService, q *queries.AuthQueries) *chi.Mux {
	r := chi.NewRouter()

	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: false,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Public: login, refresh, logout
	r.Post("/auth/login", h.Login)
	r.Post("/auth/refresh", h.Refresh)
	r.Post("/auth/logout", h.Logout)

	// Register: public erişim ama varsa token okunur (admin ise role_id dikkate alınır)
	r.With(middleware.OptionalAuth(jwtService)).Post("/auth/register", h.Register)

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(jwtService))

		r.Get("/auth/me", h.Me)

		// manage_users yetkisi gerekir
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(q, "manage_users"))
			r.Get("/users", h.ListUsers)
			r.Put("/users/{id}/role", h.AssignRole)
			r.Delete("/users/{id}", h.DeleteUser)
		})

		// assign_roles yetkisi gerekir
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequirePermission(q, "assign_roles"))
			r.Get("/roles", h.ListRoles)
			r.Put("/roles/{id}", h.UpdateRolePermissions)
		})
	})

	return r
}
