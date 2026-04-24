package middleware

import (
	"context"
	"net/http"
	"strings"

	"auth-service/internal/pkg"
	"auth-service/internal/service/commands"
)

type contextKey string

const ClaimsKey contextKey = "claims"

func Auth(jwtService *commands.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				pkg.Error(w, http.StatusUnauthorized, "token gerekli")
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := jwtService.ValidateAccessToken(tokenStr)
			if err != nil {
				pkg.Error(w, http.StatusUnauthorized, "geçersiz veya süresi dolmuş token")
				return
			}

			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequirePermission — belirli bir yetkiyi zorunlu kılar
func RequirePermission(permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(ClaimsKey).(*commands.Claims)
			if !ok {
				pkg.Error(w, http.StatusUnauthorized, "yetkisiz")
				return
			}

			for _, p := range claims.Permissions {
				if p == permission {
					next.ServeHTTP(w, r)
					return
				}
			}

			pkg.Error(w, http.StatusForbidden, "bu işlem için yetkiniz yok: "+permission)
		})
	}
}

// RequireRole — belirli bir rol zorunlu kılar
func RequireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(ClaimsKey).(*commands.Claims)
			if !ok || claims.Role != role {
				pkg.Error(w, http.StatusForbidden, "bu işlem için yetkiniz yok")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}