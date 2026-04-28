package producer

import (
	"context"
	"encoding/json"
	"fake-data-service/internal/generator"
	"time"

	"github.com/redis/go-redis/v9"
)

var ctx = context.Background()

// StartProducers her kanal için ayrı bir iş parçacığı (goroutine) başlatır
func StartProducers(rdb *redis.Client) {
	go produceTrafficLights(rdb)
	go produceDensity(rdb)
	go produceSpeedViolations(rdb)
}

func produceTrafficLights(rdb *redis.Client) {
	ticker := time.NewTicker(time.Second / 300) //saniyede 300 veri uretilmesini saglar

	defer ticker.Stop()
	//aslinda burda gizli bir channel var
	for range ticker.C { //burda da channeli okuduk her tetiklendiginde generatoru cagiriyoruz
		data := generator.GenerateTrafficLight()

		payload, err := json.Marshal(data)
		if err != nil {
			continue
		}
		//burda ticker sayesinde ve continue sayesinde 3ms sonra tekrar dene diyoruz
		err = rdb.Publish(ctx, "city:traffic_lights", payload).Err()
		if err != nil {
			continue
		}
	}
}

func produceDensity(rdb *redis.Client) {
	ticker := time.NewTicker(time.Second / 300)
	defer ticker.Stop()
	//c channel adında key
	for range ticker.C {
		data := generator.GenerateDensity()

		payload, err := json.Marshal(data) //structı dbnin anlayabileceği hale çevirdik
		if err != nil {
			continue
		}

		err = rdb.Publish(ctx, "city:density", payload).Err()
		if err != nil {
			continue
		}
	}
}

func produceSpeedViolations(rdb *redis.Client) {
	ticker := time.NewTicker(time.Second / 300)
	defer ticker.Stop()

	for range ticker.C {
		data := generator.GenerateSpeedViolation()
		//hız ihlali deglse redise yazmiyoruz
		if data.Speed > data.Limit {
			payload, err := json.Marshal(data)
			if err != nil {
				continue
			}

			err = rdb.Publish(ctx, "city:speed_violations", payload).Err()
			if err != nil {
				continue
			}
		}
	}
}
