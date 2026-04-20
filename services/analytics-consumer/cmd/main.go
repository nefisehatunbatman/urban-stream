package main

import (
	"log"
	"os"

	"analytics-consumer/internal/consumer"
)

func main() {

	log.Println("Analytics Consumer Starting...")

	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "localhost:9092"
	}

	go consumer.StartKafkaConsumer(broker, "city.traffic_lights")
	go consumer.StartKafkaConsumer(broker, "city.density")
	go consumer.StartKafkaConsumer(broker, "city.speed_violations")

	select {}
}
