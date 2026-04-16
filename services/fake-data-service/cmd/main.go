package main

import (
	"context"
	"fmt"
	"log"

	"fake-data-service/internal/config"
	"fake-data-service/internal/producer"

	"github.com/redis/go-redis/v9"
)

func main() {
	// 1. Config yükle
	cfg := config.LoadConfig()

	fmt.Println("Fake Data Service Starting...")
	fmt.Println("Redis:", cfg.RedisURL)

	// 2. Redis bağlantısı oluştur
	rdb := redis.NewClient(&redis.Options{
		Addr: cfg.RedisURL,
	})

	// 3. Bağlantıyı test et
	_, err := rdb.Ping(context.Background()).Result()
	if err != nil {
		log.Fatalf("Redis bağlantı hatası: %v", err)
	}

	fmt.Println("Redis bağlantısı başarılı")

	// 4. Producer'ları başlat
	producer.StartProducers(rdb)

	fmt.Println("Veri üretimi başladı...")

	// 5. Programın kapanmaması için blokla
	select {}
}
