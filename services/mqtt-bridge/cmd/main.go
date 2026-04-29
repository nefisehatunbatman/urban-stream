package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/segmentio/kafka-go"
)

// Kafka topic → MQTT topic eşlemesi
var topicMap = map[string]string{
	"city.traffic_lights":   "city/konya/traffic_lights",
	"city.density":          "city/konya/density",
	"city.speed_violations": "city/konya/speed_violations",
}

func main() {
	kafkaBroker := getEnv("KAFKA_BROKER", "kafka:9092")
	mqttBroker := getEnv("MQTT_BROKER", "tcp://urban-emqx:1883")

	// ── MQTT client ──────────────────────────────────────────────────────────
	opts := mqtt.NewClientOptions().
		AddBroker(mqttBroker).
		SetClientID("mqtt-bridge").
		SetCleanSession(true).
		SetAutoReconnect(true).
		SetConnectRetryInterval(3 * time.Second).
		SetOnConnectHandler(func(c mqtt.Client) {
			log.Println("[mqtt-bridge] EMQX bağlantısı kuruldu")
		}).
		SetConnectionLostHandler(func(c mqtt.Client, err error) {
			log.Printf("[mqtt-bridge] EMQX bağlantısı kesildi: %v", err)
		})

	mqttClient := mqtt.NewClient(opts)

	// EMQX hazır olana kadar bekle
	for {
		if token := mqttClient.Connect(); token.Wait() && token.Error() == nil {
			break
		}
		log.Println("[mqtt-bridge] EMQX hazır değil, 3s sonra tekrar...")
		time.Sleep(3 * time.Second)
	}

	// ── Kafka reader'ları başlat (her topic için ayrı goroutine) ────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for kafkaTopic, mqttTopic := range topicMap {
		go consume(ctx, kafkaBroker, kafkaTopic, mqttTopic, mqttClient)
	}

	log.Println("[mqtt-bridge] Tüm consumer'lar başlatıldı")

	// ── Graceful shutdown ────────────────────────────────────────────────────
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("[mqtt-bridge] Kapatılıyor...")
	cancel()
	mqttClient.Disconnect(500)
}

func consume(ctx context.Context, broker, kafkaTopic, mqttTopic string, client mqtt.Client) {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     []string{broker},
		Topic:       kafkaTopic,
		GroupID:     "mqtt-bridge-" + kafkaTopic,
		MinBytes:    1,
		MaxBytes:    1e6,
		MaxWait:     5 * time.Millisecond, // düşük latency için
		StartOffset: kafka.LastOffset,     // sadece yeni mesajlar
	})
	defer r.Close()

	log.Printf("[mqtt-bridge] Dinleniyor: kafka=%s → mqtt=%s", kafkaTopic, mqttTopic)

	for {
		select {
		case <-ctx.Done():
			return
		default:
			msg, err := r.ReadMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				log.Printf("[mqtt-bridge] Okuma hatası [%s]: %v", kafkaTopic, err)
				continue
			}

			// QoS 0: fire-and-forget — 900 msg/s için ideal
			client.Publish(mqttTopic, 0, false, msg.Value)
		}
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
