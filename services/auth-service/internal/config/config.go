package config

import (
	"os"
	"strconv"
)

type Config struct {
	// Server
	Port string

	// PostgreSQL
	PostgresHost     string
	PostgresPort     string
	PostgresUser     string
	PostgresPassword string
	PostgresDB       string

	// JWT RS256
	PrivateKeyPath string
	PublicKeyPath  string

	// Token TTL
	AccessTokenMinutes int
	RefreshTokenDays   int
}

func Load() *Config {
	return &Config{
		Port: getEnv("PORT", "8081"),

		PostgresHost:     getEnv("POSTGRES_HOST", "postgres"),
		PostgresPort:     getEnv("POSTGRES_PORT", "5432"),
		PostgresUser:     getEnv("POSTGRES_USER", "urban"),
		PostgresPassword: getEnv("POSTGRES_PASSWORD", "urban123"),
		PostgresDB:       getEnv("POSTGRES_DB", "auth_db"),

		PrivateKeyPath: getEnv("PRIVATE_KEY_PATH", "/app/keys/private.pem"),
		PublicKeyPath:  getEnv("PUBLIC_KEY_PATH", "/app/keys/public.pem"),

		AccessTokenMinutes: getEnvInt("ACCESS_TOKEN_MINUTES", 15),
		RefreshTokenDays:   getEnvInt("REFRESH_TOKEN_DAYS", 7),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
