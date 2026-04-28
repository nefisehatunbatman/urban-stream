package generator

import (
	"fake-data-service/internal/domain"
	"fmt"
	"math/rand"
	"time"
)

var rnd = rand.New(rand.NewSource(time.Now().UnixNano()))

var lightStates = make(map[string]*domain.TrafficLight)

type IntersectionType string

const (
	Fixed     IntersectionType = "fixed"
	SemiSmart IntersectionType = "semi_smart"
)

type Intersection struct {
	ID       string
	Name     string
	Type     IntersectionType
	Location domain.Location
}

const (
	minLat, maxLat = 37.8300, 37.9200
	minLng, maxLng = 32.4400, 32.5400
)

var intersections = []Intersection{
	{ID: "INT-001", Name: "Alaaddin Meydanı", Type: SemiSmart, Location: domain.Location{Lat: 37.8714, Lng: 32.4846}},
	{ID: "INT-002", Name: "Musalla Bağları", Type: Fixed, Location: domain.Location{Lat: 37.8780, Lng: 32.4920}},
	{ID: "INT-003", Name: "Karatay Meydanı", Type: Fixed, Location: domain.Location{Lat: 37.8690, Lng: 32.4970}},
	{ID: "INT-004", Name: "Meram Kavşağı", Type: SemiSmart, Location: domain.Location{Lat: 37.8620, Lng: 32.4780}},
	{ID: "INT-005", Name: "Selçuklu Merkez", Type: Fixed, Location: domain.Location{Lat: 37.8810, Lng: 32.4820}},
	{ID: "INT-006", Name: "Hocacihan Kavşağı", Type: Fixed, Location: domain.Location{Lat: 37.8750, Lng: 32.4650}},
	{ID: "INT-007", Name: "Otogar Kavşağı", Type: SemiSmart, Location: domain.Location{Lat: 37.9150, Lng: 32.5050}},
	{ID: "INT-008", Name: "Eski Sanayi", Type: Fixed, Location: domain.Location{Lat: 37.8850, Lng: 32.4980}},
	{ID: "INT-009", Name: "Kule Site Kavşağı", Type: SemiSmart, Location: domain.Location{Lat: 37.8880, Lng: 32.4920}},
	{ID: "INT-010", Name: "Belediye Kavşağı", Type: Fixed, Location: domain.Location{Lat: 37.8745, Lng: 32.4890}},
}

var lampDirections = []string{"N", "S", "E", "W"}

func init() {

	for _, inter := range intersections {
		for _, dir := range lampDirections {

			lampID := fmt.Sprintf("TL-%s-%s", inter.ID[4:], dir)

			lightStates[lampID] = &domain.TrafficLight{
				LampID:           lampID,
				Status:           "red",
				TimingRemains:    rnd.Intn(20) + 10,
				IsMalfunctioning: false,
				IntersectionID:   inter.ID,
				Location:         inter.Location,
			}
		}
	}

}

func nextStatus(current string) string {

	switch current {

	case "red":
		return "green"

	case "green":
		return "yellow"

	default:
		return "red"
	}

}

func calculateGreenTime(inter Intersection) int {

	if inter.Type == Fixed {
		return 20 + rnd.Intn(6) - 3
	}

	vehicleCount := rnd.Intn(120)

	if vehicleCount < 30 {
		return rnd.Intn(8) + 10
	}

	if vehicleCount < 70 {
		return rnd.Intn(10) + 18
	}

	return rnd.Intn(15) + 25
}

func GenerateTrafficLight() domain.TrafficLight {

	inter := intersections[rnd.Intn(len(intersections))]
	dir := lampDirections[rnd.Intn(len(lampDirections))]
	lampID := fmt.Sprintf("TL-%s-%s", inter.ID[4:], dir)

	state, exists := lightStates[lampID]

	if !exists {

		state = &domain.TrafficLight{
			LampID:           lampID,
			Status:           "red",
			TimingRemains:    30,
			IsMalfunctioning: false,
			IntersectionID:   inter.ID,
			Location:         inter.Location,
		}

		lightStates[lampID] = state
		return *state
	}

	switch state.Status {

	case "red":
		state.Status = "green"
		state.TimingRemains = calculateGreenTime(inter)

	case "green":
		state.Status = "yellow"
		state.TimingRemains = 5

	case "yellow":
		state.Status = "red"
		state.TimingRemains = 30 + rnd.Intn(10)
	}

	state.IsMalfunctioning = rnd.Float64() < 0.01

	return *state
}
func GenerateDensity() domain.Density {

	isMainRoad := rnd.Float64() < 0.35

	var lat, lng float64

	if isMainRoad {

		lat = 37.8714 + (rnd.Float64()-0.5)*0.02
		lng = 32.4846 + (rnd.Float64()-0.5)*0.02

	} else {

		lat = minLat + rnd.Float64()*(maxLat-minLat)
		lng = minLng + rnd.Float64()*(maxLng-minLng)

	}

	return domain.Density{

		ZoneID:       fmt.Sprintf("Z-%d", rnd.Intn(1000)),
		VehicleCount: rnd.Intn(250),
		Location:     domain.Location{Lat: lat, Lng: lng},
		Timestamp:    time.Now(),
	}
}

func GenerateSpeedViolation() domain.SpeedViolation {

	limit := 82

	return domain.SpeedViolation{

		VehicleID: fmt.Sprintf("42-ABC-%03d", rnd.Intn(999)),
		Speed:     limit + rnd.Intn(50),
		Limit:     limit,
		Location: domain.Location{
			Lat: minLat + rnd.Float64()*(maxLat-minLat),
			Lng: minLng + rnd.Float64()*(maxLng-minLng),
		},
	}
}
