package consumer

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type Density struct {
	ZoneID          string  `json:"zone_id"`
	VehicleCount    int     `json:"vehicle_count"`
	PedestrianCount int     `json:"pedestrian_count"`
	AvgSpeed        float64 `json:"avg_speed"`
	VehicleTypes    struct {
		Bus  int `json:"bus"`
		Car  int `json:"car"`
		Bike int `json:"bike"`
	} `json:"vehicle_types"`
	Location struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
	Timestamp string `json:"timestamp"`
}

func HandleDensity(conn clickhouse.Conn, message string) {

	var data Density
	if err := json.Unmarshal([]byte(message), &data); err != nil {
		log.Printf("Density JSON parse hatası: %v", err)
		return
	}

	// Gelen timestamp'i parse et, hata olursa now() kullan
	ts, err := time.Parse(time.RFC3339, data.Timestamp)
	if err != nil {
		log.Printf("Density timestamp parse hatası, now() kullanılıyor: %v", err)
		ts = time.Now()
	}

	err = conn.Exec(context.Background(), `
		INSERT INTO density (
			zone_id, vehicle_count, pedestrian_count, avg_speed,
			bus, car, bike, lat, lng, timestamp
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		data.ZoneID,
		data.VehicleCount,
		data.PedestrianCount,
		data.AvgSpeed,
		data.VehicleTypes.Bus,
		data.VehicleTypes.Car,
		data.VehicleTypes.Bike,
		data.Location.Lat,
		data.Location.Lng,
		ts,
	)

	if err != nil {
		log.Printf("Density insert hatası: %v", err)
	}
}
