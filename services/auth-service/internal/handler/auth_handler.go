package handler

import (
	"encoding/json"
	"net/http"

	"auth-service/internal/dto"
	"auth-service/internal/middleware"
	"auth-service/internal/pkg"
	"auth-service/internal/service/commands"
	"auth-service/internal/service/queries"

	"github.com/go-chi/chi/v5"
)

type AuthHandler struct {
	commands *commands.AuthCommands
	queries  *queries.AuthQueries
}

func NewAuthHandler(c *commands.AuthCommands, q *queries.AuthQueries) *AuthHandler {
	return &AuthHandler{commands: c, queries: q}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req dto.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkg.Error(w, http.StatusBadRequest, "geçersiz istek")
		return
	}
	if req.Email == "" || req.Password == "" {
		pkg.Error(w, http.StatusBadRequest, "email ve şifre zorunlu")
		return
	}

	resp, err := h.commands.Register(req)
	if err != nil {
		pkg.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	pkg.JSON(w, http.StatusCreated, resp)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req dto.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkg.Error(w, http.StatusBadRequest, "geçersiz istek")
		return
	}

	resp, err := h.commands.Login(req)
	if err != nil {
		pkg.Error(w, http.StatusUnauthorized, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req dto.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		pkg.Error(w, http.StatusBadRequest, "geçersiz istek")
		return
	}

	resp, err := h.commands.Refresh(req)
	if err != nil {
		pkg.Error(w, http.StatusUnauthorized, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.RefreshToken != "" {
		h.commands.Logout(body.RefreshToken)
	}
	pkg.JSON(w, http.StatusOK, map[string]string{"message": "çıkış yapıldı"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(middleware.ClaimsKey).(*commands.Claims)
	me, err := h.queries.GetMe(claims.UserID)
	if err != nil {
		pkg.Error(w, http.StatusNotFound, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, me)
}

func (h *AuthHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.queries.ListUsers()
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, users)
}

func (h *AuthHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.queries.ListRoles()
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, roles)
}

func (h *AuthHandler) AssignRole(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	var req dto.AssignRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RoleID == 0 {
		pkg.Error(w, http.StatusBadRequest, "geçersiz role_id")
		return
	}

	if err := h.commands.AssignRole(targetID, req.RoleID); err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, map[string]string{"message": "rol güncellendi"})
}
