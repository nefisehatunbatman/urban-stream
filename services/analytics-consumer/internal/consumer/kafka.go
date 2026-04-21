package consumer

import (
	"context"
	"log"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/segmentio/kafka-go"
)

func StartKafkaConsumer(broker string, topic string, conn clickhouse.Conn) {

	var reader *kafka.Reader

	for i := 0; i < 10; i++ {
		kConn, err := kafka.Dial("tcp", broker)
		if err == nil {
			kConn.Close()

			log.Printf("Kafka bağlantısı başarılı: %s", topic)

			reader = kafka.NewReader(kafka.ReaderConfig{
				Brokers:  []string{broker},
				Topic:    topic,
				GroupID:  "analytics-" + topic,
				MinBytes: 1,
				MaxBytes: 10e6,
			})

			break
		}

		log.Printf("Kafka hazır değil, retry... (%d/10) topic: %s", i+1, topic)
		time.Sleep(3 * time.Second)
	}

	if reader == nil {
		log.Printf("Kafka bağlantısı kurulamadı: %s", topic)
		return
	}

	defer reader.Close()

	log.Printf("Kafka consumer başladı: %s", topic)

	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			log.Printf("Kafka okuma hatası [%s]: %v", topic, err)
			time.Sleep(2 * time.Second)
			continue
		}

		message := string(msg.Value)
		log.Printf("Veri alındı [%s]: %s", topic, message)

		switch topic {
		case "city.traffic_lights":
			HandleTrafficLights(conn, message)
		case "city.density":
			HandleDensity(conn, message)
		case "city.speed_violations":
			HandleSpeedViolations(conn, message)
		default:
			log.Printf("Bilinmeyen topic: %s", topic)
		}
	}
}
