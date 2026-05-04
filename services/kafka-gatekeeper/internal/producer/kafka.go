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

func NewKafkaProducer(broker string) *KafkaProducer {
	for i := 0; i < 10; i++ {
		conn, err := kafka.Dial("tcp", broker)
		if err == nil {
			conn.Close()
			log.Println("Kafka bağlantısı başarılı")

			writer := &kafka.Writer{
				Addr:                   kafka.TCP(broker),
				Balancer:               &kafka.LeastBytes{},
				AllowAutoTopicCreation: true,

				// Async: ACK beklemeden devam et
				Async: true,

				// FIX: 900 msg/s → her 5ms'de ~4-5 mesaj gelir.
				// BatchSize=300 hiç dolmuyordu, flush tamamen BatchTimeout'a kalıyordu.
				// Gerçekçi değer: 5ms × 5 msg = ~25, güvenli taraf için 20 yaptık.
				BatchSize:    20,
				BatchTimeout: 5 * time.Millisecond,

				WriteTimeout: 10 * time.Second,

				ErrorLogger: kafka.LoggerFunc(func(msg string, args ...interface{}) {
					log.Printf("[kafka-error] "+msg, args...)
				}),
			}

			return &KafkaProducer{writer: writer}
		}

		log.Printf("Kafka hazır değil, retry... (%d/10)", i+1)
		time.Sleep(3 * time.Second)
	}

	log.Fatal("Kafka bağlantısı kurulamadı, sistem durduruluyor.")
	return nil
}

func (kp *KafkaProducer) SendMessage(topic string, message string) {
	if kp.writer == nil {
		return
	}

	err := kp.writer.WriteMessages(context.Background(),
		kafka.Message{
			Topic: topic,
			Value: []byte(message),
		},
	)
	if err != nil {
		log.Printf("Kafka gönderim hatası [%s]: %v", topic, err)
	}
}

func (kp *KafkaProducer) Close() {
	if kp.writer != nil {
		kp.writer.Close()
	}
}
