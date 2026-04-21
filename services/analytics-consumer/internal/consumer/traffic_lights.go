package consumer

import (
	"context"
	"encoding/json"
	"log"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type TrafficLight struct {
	LampID           string `json:"lamp_id"`
	Status           string `json:"status"`
	TimingRemains    int    `json:"timing_remains"`
	IsMalfunctioning bool   `json:"is_malfunctioning"`
	IntersectionID   string `json:"intersection_id"`
	Location         struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
}

func HandleTrafficLights(conn clickhouse.Conn, message string) {

	var data TrafficLight
	if err := json.Unmarshal([]byte(message), &data); err != nil {
		log.Printf("TrafficLight JSON parse hatası: %v", err)
		return
	}

	malfunctioning := uint8(0)
	if data.IsMalfunctioning {
		malfunctioning = 1
	}

	err := conn.Exec(context.Background(), `
		INSERT INTO traffic_lights (
			lamp_id, status, timing_remains, is_malfunctioning,
			intersection_id, lat, lng
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`,
		data.LampID,
		data.Status,
		data.TimingRemains,
		malfunctioning,
		data.IntersectionID,
		data.Location.Lat,
		data.Location.Lng,
	)

	if err != nil {
		log.Printf("TrafficLight insert hatası: %v", err)
	}
}
