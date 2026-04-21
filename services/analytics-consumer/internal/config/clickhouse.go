package config

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

func NewClickHouse() clickhouse.Conn {

	host := os.Getenv("CLICKHOUSE_HOST")
	if host == "" {
		host = "clickhouse"
	}

	port := os.Getenv("CLICKHOUSE_PORT")
	if port == "" {
		port = "9000"
	}

	user := os.Getenv("CLICKHOUSE_USER")
	if user == "" {
		user = "default"
	}

	password := os.Getenv("CLICKHOUSE_PASSWORD")

	database := os.Getenv("CLICKHOUSE_DB")
	if database == "" {
		database = "default"
	}

	addr := fmt.Sprintf("%s:%s", host, port)

	var conn clickhouse.Conn
	var err error

	for i := 0; i < 10; i++ {
		conn, err = clickhouse.Open(&clickhouse.Options{
			Addr: []string{addr},
			Auth: clickhouse.Auth{
				Database: database,
				Username: user,
				Password: password,
			},
		})

		if err != nil {
			log.Printf("ClickHouse bağlantı hatası (deneme %d/10): %v", i+1, err)
			time.Sleep(3 * time.Second)
			continue
		}

		err = conn.Ping(context.Background())
		if err != nil {
			log.Printf("ClickHouse ping hatası (deneme %d/10): %v", i+1, err)
			time.Sleep(3 * time.Second)
			continue
		}

		log.Printf("ClickHouse bağlantısı başarılı: %s", addr)
		return conn
	}

	log.Fatal("ClickHouse bağlantısı kurulamadı, sistem durduruluyor.")
	return nil
}
