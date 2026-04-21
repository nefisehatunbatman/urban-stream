package consumer

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// StartRedisSubscriber Redis'ten veri dinler ve gelen mesajları messageHandler'a iletir
func StartRedisSubscriber(rdb *redis.Client, messageHandler func(channel string, message string)) {

	ctx := context.Background()

	// Redis hazır olana kadar bekle
	for i := 0; i < 10; i++ {
		if err := rdb.Ping(ctx).Err(); err == nil {
			log.Println("Redis bağlantısı başarılı")
			break
		}
		log.Printf("Redis hazır değil, retry... (%d/10)", i+1)
		time.Sleep(3 * time.Second)
	}

	// city: ile başlayan tüm kanalları dinle (pattern subscribe)
	pubsub := rdb.PSubscribe(ctx, "city:*")
	defer pubsub.Close()

	log.Println("Redis'e subscribe olundu: city:*")

	ch := pubsub.Channel()

	for msg := range ch {
		log.Printf("Gelen veri [%s]: %s", msg.Channel, msg.Payload)
		messageHandler(msg.Channel, msg.Payload)
	}
}
