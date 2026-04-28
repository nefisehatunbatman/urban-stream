package consumer

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

func StartRedisSubscriber(rdb *redis.Client, messageHandler func(channel string, message string)) {
	ctx := context.Background()

	for i := 0; i < 10; i++ {
		if err := rdb.Ping(ctx).Err(); err == nil {
			log.Println("Redis bağlantısı başarılı")
			break
		}
		log.Printf("Redis hazır değil, retry... (%d/10)", i+1)
		time.Sleep(3 * time.Second)
	}

	pubsub := rdb.PSubscribe(ctx, "city:*")
	defer pubsub.Close()

	log.Println("Redis'e subscribe olundu: city:*")

	// Read buffer artırıldı — 300 msg/s × 3 kanal için yeterli alan
	ch := pubsub.ChannelSize(2000)

	for msg := range ch {
		// log.Printf kaldırıldı — 900 msg/s'de log I/O bottleneck
		messageHandler(msg.Channel, msg.Payload)
	}
}
