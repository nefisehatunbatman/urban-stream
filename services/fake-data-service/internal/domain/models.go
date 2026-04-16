package domain

import "time"

// Location koordinat bilgilerini temsil eder
type Location struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// TrafficLight city:traffic_lights kanalı için veri yapısı [cite: 17, 18, 19]
type TrafficLight struct {
	LampID           string   `json:"lamp_id"`
	Status           string   `json:"status"` // green, yellow, red
	TimingRemains    int      `json:"timing_remains"`
	IsMalfunctioning bool     `json:"is_malfunctioning"`
	IntersectionID   string   `json:"intersection_id"`
	Location         Location `json:"location"`
}

// VehicleTypes araç tiplerinin dağılımını temsil eder [cite: 22, 23]
type VehicleTypes struct {
	Bus  int `json:"bus"`
	Car  int `json:"car"`
	Bike int `json:"bike"`
}

// Density city:density kanalı için veri yapısı [cite: 20, 21, 24]
type Density struct {
	ZoneID          string       `json:"zone_id"`
	VehicleCount    int          `json:"vehicle_count"`
	PedestrianCount int          `json:"pedestrian_count"`
	AvgSpeed        float64      `json:"avg_speed"`
	VehicleTypes    VehicleTypes `json:"vehicle_types"`
	Location        Location     `json:"location"`
	Timestamp       time.Time    `json:"timestamp"`
}

// SpeedViolation city:speed_violations kanalı için veri yapısı [cite: 25, 26]
type SpeedViolation struct {
	VehicleID string   `json:"vehicle_id"`
	Speed     int      `json:"speed"`
	Limit     int      `json:"limit"`
	LaneID    int      `json:"lane_id"`
	Direction string   `json:"direction"`
	Location  Location `json:"location"`
}
