package config

import "os"

type Config struct {
	RedisURL string
}

func LoadConfig() *Config {
	return &Config{
		RedisURL: getEnv("REDIS_URL", "localhost:6379"),
	}
}

func getEnv(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}
