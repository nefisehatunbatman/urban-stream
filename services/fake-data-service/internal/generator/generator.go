package generator

import (
	"fake-data-service/internal/domain"
	"fmt"
	"math/rand"
	"time"
)

// rnd global random generator
var rnd = rand.New(rand.NewSource(time.Now().UnixNano()))

// init fonksiyonu paket yüklendiğinde bir kez çalışır
func init() {
	// ekstra bir şey yapmaya gerek yok artık
}

func getRandomLocation() domain.Location {
	return domain.Location{
		Lat: 37.850 + rnd.Float64()*(37.900-37.850),
		Lng: 32.450 + rnd.Float64()*(32.500-32.450),
	}
}

func GenerateTrafficLight() domain.TrafficLight {
	statuses := []string{"green", "yellow", "red"}
	status := statuses[rnd.Intn(len(statuses))]

	// status'a göre daha gerçekçi timing belirleme
	var timing int
	switch status {
	case "red":
		timing = rnd.Intn(40) + 20 // 20-60 saniye
	case "yellow":
		timing = rnd.Intn(5) + 3 // 3-8 saniye
	case "green":
		timing = rnd.Intn(30) + 10 // 10-40 saniye
	}

	return domain.TrafficLight{
		LampID:           fmt.Sprintf("TL-%03d", rnd.Intn(1000)),
		Status:           status,
		TimingRemains:    timing,
		IsMalfunctioning: rnd.Float64() < 0.05, // %5 ihtimal
		IntersectionID:   fmt.Sprintf("INT-%03d", rnd.Intn(250)),
		Location:         getRandomLocation(),
	}
}

func GenerateDensity() domain.Density {
	zones := []string{"Zone-A", "Zone-B", "Zone-C", "Zone-D"}

	buses := rnd.Intn(10)
	bikes := rnd.Intn(30)
	cars := rnd.Intn(200)

	totalVehicles := buses + bikes + cars

	// yoğunluğa göre hız hesaplama (daha gerçekçi)
	//arac sayisi arttikca hiz dussun azaldikca artsin
	densityRatio := float64(totalVehicles) / 250.0

	speed := 50.0 * (1 - densityRatio)
	if speed < 5 {
		speed = 5
	}

	return domain.Density{
		ZoneID:          zones[rnd.Intn(len(zones))],
		VehicleCount:    totalVehicles,
		PedestrianCount: rnd.Intn(100),
		AvgSpeed:        speed,
		VehicleTypes: domain.VehicleTypes{
			Bus:  buses,
			Car:  cars,
			Bike: bikes,
		},
		Location:  getRandomLocation(),
		Timestamp: time.Now(),
	}
}

func GenerateSpeedViolation() domain.SpeedViolation {
	limit := 82

	directions := []string{"North", "South", "East", "West", "North-East"}

	speed := limit + rnd.Intn(50)

	// bazen ihlal olmayan veri üret (gerçekçilik için)
	if rnd.Float64() < 0.2 {
		speed = limit - rnd.Intn(10)
	}

	return domain.SpeedViolation{
		VehicleID: fmt.Sprintf("42-ABC-%03d", rnd.Intn(999)),
		Speed:     speed,
		Limit:     limit,
		LaneID:    rnd.Intn(4) + 1,
		Direction: directions[rnd.Intn(len(directions))],
		Location:  getRandomLocation(),
	}
}
