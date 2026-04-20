package consumer

import (
	"context"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

func StartKafkaConsumer(broker string, topic string) {

	var reader *kafka.Reader

	// 🔥 Kafka hazır olana kadar bekle
	for i := 0; i < 10; i++ {
		conn, err := kafka.Dial("tcp", broker)
		if err == nil {
			conn.Close()
			log.Println("Kafka bağlantısı başarılı:", topic)

			// reader'ı burada oluştur (daha doğru)
			reader = kafka.NewReader(kafka.ReaderConfig{
				Brokers:  []string{broker},
				Topic:    topic,
				GroupID:  "analytics-" + topic, // 🔥 CRITICAL FIX
				MinBytes: 1,
				MaxBytes: 10e6,
			})

			break
		}

		log.Println("Kafka hazır değil, retry...", i)
		time.Sleep(3 * time.Second)
	}

	if reader == nil {
		log.Println("Kafka bağlantısı kurulamadı:", topic)
		return
	}

	log.Println("Kafka consumer başladı:", topic)

	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			log.Println("Kafka okuma hatası:", err)
			time.Sleep(2 * time.Second)
			continue
		}

		log.Printf("Veri alındı [%s]: %s\n", topic, string(msg.Value))
	}
}
