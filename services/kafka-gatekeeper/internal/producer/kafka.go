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

				// ── Yüksek throughput ayarları ────────────────────────────
				// Async: ACK beklemeden devam et — en kritik ayar
				Async: true,

				// Batch: 300 msg/s × 3 kanal = 900 msg/s toplam
				// 5ms'de bir veya 300 mesaj dolunca flush
				BatchSize:    300,
				BatchTimeout: 5 * time.Millisecond,

				// Write timeout: tek mesaj için değil batch için
				WriteTimeout: 10 * time.Second,

				// Hata logla ama panic yapma
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

// SendMessage: non-blocking, Kafka writer internal queue'ya ekler.
// Batch dolunca veya BatchTimeout geçince otomatik flush olur.
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
		// Async modda bu nadiren tetiklenir (sadece writer kapandıysa)
		log.Printf("Kafka gönderim hatası [%s]: %v", topic, err)
	}
	// log.Printf kaldırıldı — 900 msg/s'de log I/O ciddi bottleneck
}

// Close: uygulama kapanırken bekleyen batch'leri flush et
func (kp *KafkaProducer) Close() {
	if kp.writer != nil {
		kp.writer.Close()
	}
}
