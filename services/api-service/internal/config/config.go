package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port string

	// ClickHouse
	ClickHouseHost     string
	ClickHousePort     string
	ClickHouseUser     string
	ClickHousePassword string
	ClickHouseDB       string

	// JWT RS256 (sadece public key lazım, doğrulama için)
	PublicKeyPath string

	// Kafka (canlı veri için)
	KafkaBroker string
}

func Load() *Config {
	return &Config{
		Port: getEnv("PORT", "8082"),

		ClickHouseHost:     getEnv("CLICKHOUSE_HOST", "clickhouse"),
		ClickHousePort:     getEnv("CLICKHOUSE_PORT", "9000"),
		ClickHouseUser:     getEnv("CLICKHOUSE_USER", "default"),
		ClickHousePassword: getEnv("CLICKHOUSE_PASSWORD", "urban123"),
		ClickHouseDB:       getEnv("CLICKHOUSE_DB", "default"),

		PublicKeyPath: getEnv("PUBLIC_KEY_PATH", "/app/keys/public.pem"),

		KafkaBroker: getEnv("KAFKA_BROKER", "kafka:9092"),
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
