package producer

import (
	"context"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

type KafkaProducer struct {
	writer *kafka.Writer
	broker string
}

// NewKafkaProducer Kafka bağlantısını retry ile kurar
func NewKafkaProducer(broker string) *KafkaProducer {

	for i := 0; i < 10; i++ {
		conn, err := kafka.Dial("tcp", broker)
		if err == nil {
			conn.Close()
			log.Println("Kafka bağlantısı başarılı")

			writer := &kafka.Writer{
				Addr:                   kafka.TCP(broker),
				Balancer:               &kafka.LeastBytes{}, //mesajlar en az dolu partitiona gider
				AllowAutoTopicCreation: true,
			}

			return &KafkaProducer{
				writer: writer,
				broker: broker,
			}
		}

		log.Printf("Kafka hazır değil, retry... (%d/10)", i+1)
		time.Sleep(3 * time.Second)
	}

	log.Fatal("Kafka bağlantısı kurulamadı, sistem durduruluyor.")
	return nil
}

// SendMessage Kafka topic'ine mesaj gönderir
func (kp *KafkaProducer) SendMessage(topic string, message string) {

	if kp.writer == nil {
		log.Println("Kafka writer nil, mesaj gönderilemedi")
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
		return
	}

	log.Printf("Kafka'ya gönderildi [%s]", topic)
}
