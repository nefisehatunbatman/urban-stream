package middleware

import (
	"context"
	"net/http"
	"strings"

	"auth-service/internal/pkg"
	"auth-service/internal/service/commands"
	"auth-service/internal/service/queries"
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

// OptionalAuth — token varsa ve geçerliyse claims'i context'e ekler, yoksa devam eder
func OptionalAuth(jwtService *commands.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
				tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
				if claims, err := jwtService.ValidateAccessToken(tokenStr); err == nil {
					ctx := context.WithValue(r.Context(), ClaimsKey, claims)
					r = r.WithContext(ctx)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequirePermission — izinleri her istekte DB'den okur, token'daki eski izinlere güvenmez
func RequirePermission(q *queries.AuthQueries, permission string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(ClaimsKey).(*commands.Claims)
			if !ok {
				pkg.Error(w, http.StatusUnauthorized, "yetkisiz")
				return
			}

			perms, err := q.GetPermissions(claims.UserID)
			if err != nil {
				pkg.Error(w, http.StatusInternalServerError, "izinler alınamadı")
				return
			}

			for _, p := range perms {
				if p == permission {
					next.ServeHTTP(w, r)
					return
				}
			}

			pkg.Error(w, http.StatusForbidden, "bu işlem için yetkiniz yok: "+permission)
		})
	}
}

// RequireRoleID — kullanıcının role_id'si maxRoleID'den küçük veya eşit olmalı (1=admin ≤ 2=operator ≤ 3=viewer)
func RequireRoleID(maxRoleID int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(ClaimsKey).(*commands.Claims)
			if !ok {
				pkg.Error(w, http.StatusUnauthorized, "yetkisiz")
				return
			}
			if claims.RoleID == 0 || claims.RoleID > maxRoleID {
				pkg.Error(w, http.StatusForbidden, "bu işlem için yetkiniz yok")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireRole — değişmedi
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
