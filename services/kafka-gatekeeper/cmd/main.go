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

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis:6379"
	}

	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "kafka:9092"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: redisURL,
	})

	kp := producer.NewKafkaProducer(kafkaBroker)

	consumer.StartRedisSubscriber(rdb, func(channel string, message string) {
		topic := producer.MapChannelToTopic(channel)
		kp.SendMessage(topic, message)
	})
}
