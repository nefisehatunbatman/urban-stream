package producer

import (
	"context"
	"encoding/json"
	"fake-data-service/internal/generator"
	"time"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

// ─── Hedef: her kanaldan 300 msg/s ───────────────────────────────────────────
//
// city:traffic_lights  → 10 kavşak goroutine × ~30 olay/s = ~300 msg/s (event-driven)
//                        4 worker paralel tüketim ile Redis'e yazılır.
//
// city:density         → ticker 3.33ms → 300 msg/s
//
// city:speed_violations→ ticker 3.33ms → 300 msg/s
//                        GenerateSpeedViolation() zaten excess>0 garantili,
//                        eski "speed <= limit" drop kaldırıldı.

const (
	targetMsgPerSec = 300
	tickerInterval  = time.Second / targetMsgPerSec // ~3.333ms
	trafficWorkers  = 4
)

func StartProducers(rdb *redis.Client) {
	for range trafficWorkers {
		go publishTrafficLightWorker(rdb)
	}
	go produceDensity(rdb)
	go produceSpeedViolations(rdb)
}

// publishTrafficLightWorker: eventQueue'dan bloklamalı okur.
// 4 worker → yüksek Redis latency durumunda bile kuyruk boşalmaz.
func publishTrafficLightWorker(rdb *redis.Client) {
	for {
		event := generator.NextTrafficLightEvent()

		payload, err := json.Marshal(event)
		if err != nil {
			continue
		}
		if err := rdb.Publish(ctx, "city:traffic_lights", payload).Err(); err != nil {
			time.Sleep(10 * time.Millisecond)
		}
	}
}

// produceDensity: ~3.33ms'de bir → 300 msg/s
func produceDensity(rdb *redis.Client) {
	ticker := time.NewTicker(tickerInterval)
	defer ticker.Stop()

	for range ticker.C {
		payload, err := json.Marshal(generator.GenerateDensity())
		if err != nil {
			continue
		}
		_ = rdb.Publish(ctx, "city:density", payload).Err()
	}
}

// produceSpeedViolations: ~3.33ms'de bir → 300 msg/s
func produceSpeedViolations(rdb *redis.Client) {
	ticker := time.NewTicker(tickerInterval)
	defer ticker.Stop()

	for range ticker.C {
		payload, err := json.Marshal(generator.GenerateSpeedViolation())
		if err != nil {
			continue
		}
		_ = rdb.Publish(ctx, "city:speed_violations", payload).Err()
	}
}
