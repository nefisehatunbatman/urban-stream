package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type SpeedViolation struct {
	VehicleID string  `json:"vehicle_id"`
	Speed     float64 `json:"speed"`
	Limit     float64 `json:"limit"`
	LaneID    int     `json:"lane_id"`
	Direction string  `json:"direction"`
	Location  struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
}

func HandleSpeedViolations(conn clickhouse.Conn, message string) {

	var data SpeedViolation
	if err := json.Unmarshal([]byte(message), &data); err != nil {
		log.Printf("SpeedViolation JSON parse hatası: %v", err)
		return
	}

	err := conn.Exec(context.Background(), `
		INSERT INTO speed_violations (
			vehicle_id, speed, speed_limit, lane_id,
			direction, lat, lng
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		data.VehicleID,
		data.Speed,
		data.Limit,
		data.LaneID,
		data.Direction,
		data.Location.Lat,
		data.Location.Lng,
	)

	if err != nil {
		log.Printf("SpeedViolation insert hatası: %v", err)
	}
}
