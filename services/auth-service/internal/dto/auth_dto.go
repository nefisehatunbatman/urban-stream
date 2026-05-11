package dto

// --- Request ---

type RegisterRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
	FullName string `json:"full_name"`
	// RoleID opsiyoneldir; yalnızca admin token'ı ile çağrıldığında dikkate alınır.
	// 0 veya belirtilmezse varsayılan viewer (id=3) atanır.
	RoleID int `json:"role_id"`
}

type LoginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type AssignRoleRequest struct {
	RoleID int `json:"role_id" validate:"required"`
}

// UpdateRolePermissionsRequest — PUT /roles/:id gövdesi
type UpdateRolePermissionsRequest struct {
	Permissions []string `json:"permissions"` // İzin adları: ["manage_users","view_stats",...]
}

// --- Response ---

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // saniye
}

type UserResponse struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	FullName    string   `json:"full_name"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
	IsActive    bool     `json:"is_active"`
	CreatedAt   string   `json:"created_at"`
}

type MeResponse struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	FullName    string   `json:"full_name"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}
