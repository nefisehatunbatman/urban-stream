package main

import (
	"log"
	"os"

	"analytics-consumer/internal/config"
	"analytics-consumer/internal/consumer"
)

func main() {

	log.Println("Analytics Consumer Starting...")

	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "kafka:9092"
	}

	conn := config.NewClickHouse()

	// Tabloları oluştur
	config.RunMigrations(conn)

	go consumer.StartKafkaConsumer(broker, "city.traffic_lights", conn)
	go consumer.StartKafkaConsumer(broker, "city.density", conn)
	go consumer.StartKafkaConsumer(broker, "city.speed_violations", conn)

	select {}
}
