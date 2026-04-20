package producer

import (
	"context"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

type KafkaProducer struct {
	writer *kafka.Writer
}

// Kafka bağlantısı (retry ile)
func NewKafkaProducer(broker string) *KafkaProducer {

	var writer *kafka.Writer

	for i := 0; i < 10; i++ {
		writer = &kafka.Writer{
			Addr:     kafka.TCP(broker),
			Balancer: &kafka.LeastBytes{},
		}

		err := writer.WriteMessages(context.Background(),
			kafka.Message{
				Topic: "test",
				Value: []byte("ping"),
			},
		)

		if err == nil {
			log.Println("Kafka bağlantısı başarılı")
			break
		}

		log.Println("Kafka hazır değil, retry...", i)
		time.Sleep(3 * time.Second)
	}

	return &KafkaProducer{
		writer: writer,
	}
}

// BU FONKSİYON EKSİKTİ (KRİTİK)
func (kp *KafkaProducer) SendMessage(topic string, message string) {
	err := kp.writer.WriteMessages(context.Background(),
		kafka.Message{
			Topic: topic,
			Value: []byte(message),
		},
	)

	if err != nil {
		log.Println("Kafka gönderim hatası:", err)
		return
	}

	log.Printf("Kafka'ya gönderildi [%s]\n", topic)
}
