package generator

import (
	"fake-data-service/internal/domain"
	"fmt"
	"math"
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

// ─── Sabit Yoğunluk Bölgeleri ─────────────────────────────────────────────────
// Her bölgenin sabit bir ID ve merkez koordinatı var.
// Veri geldiğinde aynı zone_id güncellendiği için heatmap anlamlı birikir.

type DensityZone struct {
	ZoneID   string
	Name     string
	Location domain.Location
	// Bölgenin trafik "ağırlığı": yüksek = daha yoğun olabilir (0.0–1.0)
	Weight float64
}

var densityZones = []DensityZone{
	// Merkez & ana arterler → yüksek ağırlık
	{ZoneID: "ZONE-001", Name: "Alaaddin Çevresi", Location: domain.Location{Lat: 37.8714, Lng: 32.4846}, Weight: 1.0},
	{ZoneID: "ZONE-002", Name: "Mevlana Caddesi", Location: domain.Location{Lat: 37.8730, Lng: 32.4900}, Weight: 0.9},
	{ZoneID: "ZONE-003", Name: "Nalçacı Caddesi", Location: domain.Location{Lat: 37.8760, Lng: 32.4870}, Weight: 0.85},
	{ZoneID: "ZONE-004", Name: "Ankara Caddesi", Location: domain.Location{Lat: 37.8800, Lng: 32.4950}, Weight: 0.8},
	{ZoneID: "ZONE-005", Name: "Musalla Bağları", Location: domain.Location{Lat: 37.8780, Lng: 32.4920}, Weight: 0.75},
	// Orta yoğunluk
	{ZoneID: "ZONE-006", Name: "Karatay Meydanı", Location: domain.Location{Lat: 37.8690, Lng: 32.4970}, Weight: 0.65},
	{ZoneID: "ZONE-007", Name: "Selçuklu Merkez", Location: domain.Location{Lat: 37.8810, Lng: 32.4820}, Weight: 0.60},
	{ZoneID: "ZONE-008", Name: "Meram Kavşağı", Location: domain.Location{Lat: 37.8620, Lng: 32.4780}, Weight: 0.55},
	{ZoneID: "ZONE-009", Name: "Hocacihan", Location: domain.Location{Lat: 37.8750, Lng: 32.4650}, Weight: 0.50},
	{ZoneID: "ZONE-010", Name: "Kule Site", Location: domain.Location{Lat: 37.8880, Lng: 32.4920}, Weight: 0.55},
	// Düşük yoğunluk / çevre
	{ZoneID: "ZONE-011", Name: "Otogar Çevresi", Location: domain.Location{Lat: 37.9150, Lng: 32.5050}, Weight: 0.40},
	{ZoneID: "ZONE-012", Name: "Eski Sanayi", Location: domain.Location{Lat: 37.8850, Lng: 32.4980}, Weight: 0.35},
	{ZoneID: "ZONE-013", Name: "Belediye Kavşağı", Location: domain.Location{Lat: 37.8745, Lng: 32.4890}, Weight: 0.45},
	{ZoneID: "ZONE-014", Name: "Stadyum Çevresi", Location: domain.Location{Lat: 37.8670, Lng: 32.4720}, Weight: 0.30},
	{ZoneID: "ZONE-015", Name: "Zafer Çarşısı", Location: domain.Location{Lat: 37.8720, Lng: 32.4830}, Weight: 0.70},
}

// ─── Saatlik Trafik Çarpanı ───────────────────────────────────────────────────
// Gece düşük, sabah/akşam rush hour yüksek → gerçekçi simülasyon
func hourlyMultiplier() float64 {
	h := float64(time.Now().Hour())
	// Gaussian benzeri çift tepe: 08:00 ve 17:30
	morningPeak := math.Exp(-0.5 * math.Pow((h-8.0)/1.5, 2))
	eveningPeak := math.Exp(-0.5 * math.Pow((h-17.5)/1.5, 2))
	nightBase := 0.15
	return nightBase + 0.85*(morningPeak+eveningPeak)/2.0
}

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

	// süreyi azalt
	state.TimingRemains--

	// süre bittiyse state değiştir
	if state.TimingRemains <= 0 {

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
	}

	state.IsMalfunctioning = rnd.Float64() < 0.01

	return *state
}

// GenerateDensity: sabit bölgelerden biri seçilir, saatlik çarpan + ağırlık
// uygulanarak gerçekçi vehicle_count üretilir.
// Aynı zone_id tekrar geldiğinde frontend heatmap'i günceller (yeni nokta eklemez).
func GenerateDensity() domain.Density {
	// Ağırlıklı rastgele seçim: yüksek weight → daha sık seçilir
	totalWeight := 0.0
	for _, z := range densityZones {
		totalWeight += z.Weight
	}
	r := rnd.Float64() * totalWeight
	var selected DensityZone
	for _, z := range densityZones {
		r -= z.Weight
		if r <= 0 {
			selected = z
			break
		}
	}
	if selected.ZoneID == "" {
		selected = densityZones[0]
	}

	// Saatlik çarpan × bölge ağırlığı × max araç sayısı (250) + küçük gürültü
	multiplier := hourlyMultiplier()
	baseCount := selected.Weight * multiplier * 250.0
	noise := (rnd.Float64() - 0.5) * 30.0
	vehicleCount := int(math.Max(0, math.Min(250, baseCount+noise)))

	// Koordinata küçük jitter ekle (aynı nokta üst üste gelmez, doğal görünür)
	jitterLat := (rnd.Float64() - 0.5) * 0.003
	jitterLng := (rnd.Float64() - 0.5) * 0.003

	return domain.Density{
		ZoneID:       selected.ZoneID,
		VehicleCount: vehicleCount,
		Location: domain.Location{
			Lat: selected.Location.Lat + jitterLat,
			Lng: selected.Location.Lng + jitterLng,
		},
		Timestamp: time.Now(),
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
