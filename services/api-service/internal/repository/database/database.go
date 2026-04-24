package database

import (
	"fmt"
	"log"

	"context"

	"api-service/internal/config"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

func NewClickHouseDB(cfg *config.Config) driver.Conn {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%s", cfg.ClickHouseHost, cfg.ClickHousePort)},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDB,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
	})
	if err != nil {
		log.Fatalf("ClickHouse bağlantısı açılamadı: %v", err)
	}

	if err := conn.Ping(context.Background()); err != nil {
		log.Fatalf("ClickHouse ping başarısız: %v", err)
	}

	log.Println("ClickHouse bağlantısı başarılı")
	return conn
}
