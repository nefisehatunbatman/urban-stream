package domain

import "time"

// Location koordinat bilgilerini temsil eder
type Location struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// timing_remainsi kaldırdım unutmaaa
// Gerçek sensörler (özellikle akıllı kavşaklar) bir sonraki geçişin ne zaman
// olacağını önceden bildirmez — sadece "şu an bu duruma geçtim" olayını atar.
// Frontend yalnızca bu olayı dinler, tahmin yapmaz.
type TrafficLight struct {
	LampID           string    `json:"lamp_id"`
	IntersectionID   string    `json:"intersection_id"`
	Status           string    `json:"status"`     // green | yellow | red
	ChangedAt        time.Time `json:"changed_at"` // geçişin tam zamanı (UTC)
	IsMalfunctioning bool      `json:"is_malfunctioning"`
	Location         Location  `json:"location"`
}

// VehicleTypes araç tiplerinin dağılımını temsil eder
type VehicleTypes struct {
	Bus  int `json:"bus"`
	Car  int `json:"car"`
	Bike int `json:"bike"`
}

// Density city:density kanalı için veri yapısı
type Density struct {
	ZoneID          string       `json:"zone_id"`
	VehicleCount    int          `json:"vehicle_count"`
	PedestrianCount int          `json:"pedestrian_count"`
	AvgSpeed        float64      `json:"avg_speed"`
	VehicleTypes    VehicleTypes `json:"vehicle_types"`
	Location        Location     `json:"location"`
	Timestamp       time.Time    `json:"timestamp"`
}

// SpeedViolation city:speed_violations kanalı için veri yapısı
type SpeedViolation struct {
	VehicleID string   `json:"vehicle_id"`
	Speed     int      `json:"speed"`
	Limit     int      `json:"limit"`
	LaneID    int      `json:"lane_id"`
	Direction string   `json:"direction"`
	Location  Location `json:"location"`
}
