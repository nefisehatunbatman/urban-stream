package consumer

import (
	"context"
	"log"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

// StartRedisSubscriber Redis'ten veri dinler
func StartRedisSubscriber(rdb *redis.Client, messageHandler func(channel string, message string)) {

	pubsub := rdb.PSubscribe(ctx, "city:*") //normal subcribes yerine patternsubcribes yani basinde city olan hepsini dinle

	log.Println("Redis'e subscribe olundu...")

	ch := pubsub.Channel() //verileri tasima bandi

	for msg := range ch {
		log.Printf("Gelen veri [%s]: %s\n", msg.Channel, msg.Payload)
		// gelen veriyi dışarıya gönder (Kafka'ya)
		messageHandler(msg.Channel, msg.Payload)
	}
}
