package main

import (
	"log"
	"os"

	"kafka-gatekeeper/internal/consumer"
	"kafka-gatekeeper/internal/producer"

	"github.com/redis/go-redis/v9"
)

func main() {

	log.Println("Kafka Gatekeeper Starting...")

	// Redis bağlantısı
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis:6379"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: redisURL,
	})

	// Kafka bağlantısı
	kafkaBroker := "kafka:9092"
	kp := producer.NewKafkaProducer(kafkaBroker)

	// Redis subscriber başlat
	consumer.StartRedisSubscriber(rdb, func(channel string, message string) {

		topic := producer.MapChannelToTopic(channel)

		kp.SendMessage(topic, message)
	})
}
