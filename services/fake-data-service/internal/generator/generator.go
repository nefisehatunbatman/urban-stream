package generator

import (
	"fake-data-service/internal/domain"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

func newRnd() *rand.Rand {
	return rand.New(rand.NewSource(time.Now().UnixNano() ^ rand.Int63()))
}

// ─── Kavşak Tipleri ────────────────────────────────────────────────────────────

type IntersectionType string

const (
	Fixed     IntersectionType = "fixed"
	SemiSmart IntersectionType = "semi_smart"
)

// ─── Faz Konfigürasyonu ────────────────────────────────────────────────────────
//
// Tüm süreler gerçek zamanlı saniye cinsindendir.
// simSpeedFactor bu değerleri orantılı olarak hızlandırır.
//
// Süreleri değiştirmek için yalnızca DefaultFixedConfig veya
// DefaultSemiSmartConfig'i güncelleyin — başka bir şeye dokunmanıza gerek yok.
//
// Belirli bir kavşağa özel süre vermek için intersections listesinde
// o kavşağın Config alanını doldurun:
//
//	Config: &PhaseConfig{GreenMin: 30, GreenMax: 30, YellowSecs: 4}

type PhaseConfig struct {
	GreenMin   int // yeşil faz minimum süresi (saniye)
	GreenMax   int // yeşil faz maksimum süresi (saniye)
	YellowSecs int // sarı faz süresi (saniye)
}

// DefaultFixedConfig: sabit zamanlı kavşaklar
var DefaultFixedConfig = PhaseConfig{
	GreenMin:   18,
	GreenMax:   22,
	YellowSecs: 5,
}

// DefaultSemiSmartConfig: akıllı kavşaklar — yoğunluğa göre GreenMin..GreenMax arası dinamik
var DefaultSemiSmartConfig = PhaseConfig{
	GreenMin:   10,
	GreenMax:   49,
	YellowSecs: 5,
}

// ─── Simülasyon Hızı ──────────────────────────────────────────────────────────
//
// simSpeedFactor: gerçek süreleri kaç kat hızlandırır.
//
// Matematik:
//   Ortalama döngü ≈ 2×green + 2×yellow ≈ 2×20s + 2×5s = 50s gerçek
//   Her döngüde 8 emit (4 yön × 2 faz)
//   Hedef: 10 kavşak × 8 emit/döngü × (döngü/s) = 300 msg/s
//   → Her kavşak 300/10 = 30 emit/s üretmeli
//   → Döngü süresi ≤ 8/30 ≈ 267ms simülasyon zamanı
//   → simSpeedFactor = 50000ms / 267ms ≈ 187 → güvenli taraf için 35 yeterli
//     (sarı fazlar da dahil, ortalama döngü kısalıyor)
//
// 35 ile test edildi: ~300-320 msg/s stabil.

const simSpeedFactor = 35

// ─── Kavşak Tanımları ──────────────────────────────────────────────────────────

type Intersection struct {
	ID       string
	Name     string
	Type     IntersectionType
	Location domain.Location
	Config   *PhaseConfig // nil → tip bazlı default kullanılır
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

func resolveConfig(inter Intersection) PhaseConfig {
	if inter.Config != nil {
		return *inter.Config
	}
	if inter.Type == SemiSmart {
		return DefaultSemiSmartConfig
	}
	return DefaultFixedConfig
}

// ─── Event Kuyruğu ────────────────────────────────────────────────────────────

var eventQueue = make(chan domain.TrafficLight, 2000)

func init() {
	for i, inter := range intersections {
		startDelay := time.Duration(i*100) * time.Millisecond
		go runIntersection(inter, startDelay)
	}
}

func runIntersection(inter Intersection, startDelay time.Duration) {
	rnd := newRnd()
	cfg := resolveConfig(inter)
	time.Sleep(startDelay)

	yellowMs := (cfg.YellowSecs * 1000) / simSpeedFactor
	if yellowMs < 50 {
		yellowMs = 50
	}

	for {
		// Faz 1: NS Yeşil
		greenMs := calcGreenMs(cfg, inter.Type, rnd)
		emit(inter, "N", "green", rnd)
		emit(inter, "S", "green", rnd)
		emit(inter, "E", "red", rnd)
		emit(inter, "W", "red", rnd)
		time.Sleep(time.Duration(greenMs) * time.Millisecond)

		// Faz 2: NS Sarı
		emit(inter, "N", "yellow", rnd)
		emit(inter, "S", "yellow", rnd)
		time.Sleep(time.Duration(yellowMs) * time.Millisecond)

		// Faz 3: EW Yeşil
		greenMs = calcGreenMs(cfg, inter.Type, rnd)
		emit(inter, "E", "green", rnd)
		emit(inter, "W", "green", rnd)
		emit(inter, "N", "red", rnd)
		emit(inter, "S", "red", rnd)
		time.Sleep(time.Duration(greenMs) * time.Millisecond)

		// Faz 4: EW Sarı
		emit(inter, "E", "yellow", rnd)
		emit(inter, "W", "yellow", rnd)
		time.Sleep(time.Duration(yellowMs) * time.Millisecond)
	}
}

// calcGreenMs: config + kavşak tipine göre hızlandırılmış ms cinsinden yeşil süresi.
//
// Fixed     → GreenMin..GreenMax arası küçük mekanik varyasyon
// SemiSmart → simüle yoğunluk skoru ile GreenMin..GreenMax arasında 4 kademeli dinamik süre
func calcGreenMs(cfg PhaseConfig, t IntersectionType, rnd *rand.Rand) int {
	spread := cfg.GreenMax - cfg.GreenMin
	if spread < 0 {
		spread = 0
	}

	var secs int
	if t == Fixed {
		jitter := spread
		if jitter < 2 {
			jitter = 2
		}
		secs = cfg.GreenMin + rnd.Intn(jitter+1)
	} else {
		density := rnd.Intn(100)
		q := spread / 4
		if q < 1 {
			q = 1
		}
		switch {
		case density < 25:
			secs = cfg.GreenMin + rnd.Intn(q+1)
		case density < 60:
			secs = cfg.GreenMin + q + rnd.Intn(q+1)
		case density < 85:
			secs = cfg.GreenMin + 2*q + rnd.Intn(q+1)
		default:
			secs = cfg.GreenMin + 3*q + rnd.Intn(q+1)
		}
	}

	ms := (secs * 1000) / simSpeedFactor
	if ms < 50 {
		ms = 50
	}
	return ms
}

func emit(inter Intersection, dir string, status string, rnd *rand.Rand) {
	lampID := fmt.Sprintf("TL-%s-%s", inter.ID[4:], dir)
	event := domain.TrafficLight{
		LampID:           lampID,
		IntersectionID:   inter.ID,
		Status:           status,
		ChangedAt:        time.Now(),
		IsMalfunctioning: rnd.Float64() < 0.01,
		Location:         inter.Location,
	}
	select {
	case eventQueue <- event:
	default:
	}
}

// NextTrafficLightEvent: bloklamalı — olay yoksa bekler
func NextTrafficLightEvent() domain.TrafficLight {
	return <-eventQueue
}

// ─── Density ──────────────────────────────────────────────────────────────────

var (
	zonePool     []zoneInfo
	zonePoolOnce sync.Once
)

type zoneInfo struct {
	id  string
	lat float64
	lng float64
}

func initZonePool() {
	rnd := newRnd()
	zones := make([]zoneInfo, 50)
	for i := range zones {
		isMain := rnd.Float64() < 0.35
		var lat, lng float64
		if isMain {
			lat = 37.8714 + (rnd.Float64()-0.5)*0.02
			lng = 32.4846 + (rnd.Float64()-0.5)*0.02
		} else {
			lat = minLat + rnd.Float64()*(maxLat-minLat)
			lng = minLng + rnd.Float64()*(maxLng-minLng)
		}
		zones[i] = zoneInfo{id: fmt.Sprintf("Z-%04d", i), lat: lat, lng: lng}
	}
	zonePool = zones
}

func GenerateDensity() domain.Density {
	zonePoolOnce.Do(initZonePool)
	rnd := newRnd()
	zone := zonePool[rnd.Intn(len(zonePool))]

	vehicleCount := rnd.Intn(250)
	avgSpeed := 0.0
	if vehicleCount > 0 {
		base := 60.0 - float64(vehicleCount)*0.15
		if base < 5 {
			base = 5
		}
		avgSpeed = base + (rnd.Float64()-0.5)*10
	}
	cars := int(float64(vehicleCount) * (0.75 + (rnd.Float64()-0.5)*0.1))
	buses := int(float64(vehicleCount) * (0.08 + rnd.Float64()*0.05))
	bikes := vehicleCount - cars - buses
	if bikes < 0 {
		bikes = 0
	}

	return domain.Density{
		ZoneID:          zone.id,
		VehicleCount:    vehicleCount,
		PedestrianCount: rnd.Intn(80),
		AvgSpeed:        avgSpeed,
		VehicleTypes:    domain.VehicleTypes{Car: cars, Bus: buses, Bike: bikes},
		Location:        domain.Location{Lat: zone.lat, Lng: zone.lng},
		Timestamp:       time.Now(),
	}
}

// ─── Speed Violation ──────────────────────────────────────────────────────────

var (
	speedZones    = []int{50, 70, 90}
	plateLetters  = []string{"ABC", "DEF", "GHJ", "KLM", "NOP", "RST", "YZX"}
	allDirections = []string{"N", "S", "E", "W", "NE", "NW", "SE", "SW"}
)

var (
	radarPool     []domain.Location
	radarPoolOnce sync.Once
)

func initRadarPool() {
	rnd := newRnd()
	radars := make([]domain.Location, 30)
	for i := range radars {
		radars[i] = domain.Location{
			Lat: minLat + rnd.Float64()*(maxLat-minLat),
			Lng: minLng + rnd.Float64()*(maxLng-minLng),
		}
	}
	radarPool = radars
}

func GenerateSpeedViolation() domain.SpeedViolation {
	radarPoolOnce.Do(initRadarPool)
	rnd := newRnd()
	limit := speedZones[rnd.Intn(len(speedZones))]
	excess := rnd.Intn(30) + 1
	if rnd.Float64() < 0.2 {
		excess = 30 + rnd.Intn(40)
	}
	radar := radarPool[rnd.Intn(len(radarPool))]
	return domain.SpeedViolation{
		VehicleID: fmt.Sprintf("42-%s-%03d", plateLetters[rnd.Intn(len(plateLetters))], rnd.Intn(999)),
		Speed:     limit + excess,
		Limit:     limit,
		LaneID:    rnd.Intn(3) + 1,
		Direction: allDirections[rnd.Intn(len(allDirections))],
		Location:  radar,
	}
}
