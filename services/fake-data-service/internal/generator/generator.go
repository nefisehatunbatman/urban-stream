package generator

import (
	"fake-data-service/internal/domain"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
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

type PhaseConfig struct {
	GreenMin   int
	GreenMax   int
	YellowSecs int
}

var DefaultFixedConfig = PhaseConfig{
	GreenMin:   18,
	GreenMax:   22,
	YellowSecs: 5,
}

var DefaultSemiSmartConfig = PhaseConfig{
	GreenMin:   10,
	GreenMax:   49,
	YellowSecs: 5,
}

// ─── Simülasyon Hızı ──────────────────────────────────────────────────────────
//
// Hesap: Fixed kavşak ortalama green=20s, yellow=5s, döngüde 2 faz var.
// Bir döngü = 2×green + 2×yellow = 50s gerçek zaman.
// Döngüde 8 emit var (4 yön × 2 faz).
// Hedef: 10 kavşak × 8 emit / döngü_ms = 300/s ortalama
// simSpeedFactor=80: döngü ~534ms → 10×8/534ms ≈ 150/s taban
// Spike'ları yaymak için startDelay 300ms'ye çıkarıldı (toplam 3s spread)

const simSpeedFactor = 110

// ─── Kavşak Tanımları ──────────────────────────────────────────────────────────

type Intersection struct {
	ID       string
	Name     string
	Type     IntersectionType
	Location domain.Location
	Config   *PhaseConfig
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

// ayar yoksa default ayar ver
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
// 5000 kapasiteli bufferi olan bir channel tanimladik
var eventQueue = make(chan domain.TrafficLight, 5000)

// bu degisken kuyruga sigmadigi icin atilanlarin sayisini tutar
var droppedCount atomic.Int64

func init() {
	//ilk acildiginda asiri yukleme olmamasi icin kademeli baslatiriz 1.kavsak baslar 300 sn sonra digeri ... seklinde ilerler
	for i, inter := range intersections {
		startDelay := time.Duration(i*300) * time.Millisecond
		go runIntersection(inter, startDelay)
	}

	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			dropped := droppedCount.Swap(0)
			if dropped > 0 {
				fmt.Printf("[traffic-lights] Son 10s içinde %d event drop edildi\n", dropped)
			}
		}
	}()
}

func runIntersection(inter Intersection, startDelay time.Duration) {
	rnd := newRnd()
	cfg := resolveConfig(inter) //kavsak akill mi degil mi bakariz oa gore isiklaarin yanma surelerine bakilir
	time.Sleep(startDelay)      //kavsaklar ayni anda degil sirayla uyaniyor

	yellowMs := (cfg.YellowSecs * 1000) / simSpeedFactor //sari siik suresini ayarlar
	if yellowMs < 50 {
		yellowMs = 50
	}

	for {
		greenMs := calcGreenMs(cfg, inter.Type, rnd)
		emit(inter, "N", "green", rnd) //kuze ve guney yesil
		emit(inter, "S", "green", rnd)
		emit(inter, "E", "red", rnd) //dogu ve bati kirmizi sinayli gonder
		emit(inter, "W", "red", rnd)
		time.Sleep(time.Duration(greenMs) * time.Millisecond)

		emit(inter, "N", "yellow", rnd)
		emit(inter, "S", "yellow", rnd)
		time.Sleep(time.Duration(yellowMs) * time.Millisecond)

		greenMs = calcGreenMs(cfg, inter.Type, rnd)
		emit(inter, "E", "green", rnd)
		emit(inter, "W", "green", rnd)
		emit(inter, "N", "red", rnd)
		emit(inter, "S", "red", rnd)
		time.Sleep(time.Duration(greenMs) * time.Millisecond)

		emit(inter, "E", "yellow", rnd)
		emit(inter, "W", "yellow", rnd)
		time.Sleep(time.Duration(yellowMs) * time.Millisecond)
	}
}

func calcGreenMs(cfg PhaseConfig, t IntersectionType, rnd *rand.Rand) int {
	spread := cfg.GreenMax - cfg.GreenMin //alabilecegi deger araligi hesaplanir
	if spread < 0 {
		spread = 0
	}

	var secs int
	if t == Fixed { //sabit kavsaksa
		jitter := spread //tum isklar ayni olmasin diye jitter ile bi sapma ekliyoruz
		if jitter < 2 {
			jitter = 2
		}
		secs = cfg.GreenMin + rnd.Intn(jitter+1)
	} else {
		//yogunluga gore sureyi ayarliyor
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
	//simspeedfactorun mantikli siirlar icinde olmasini saglariz mesela 1000 olurs isik 1ms yanip sobeilir bu da mantiikli olmaz
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
		IsMalfunctioning: rnd.Float64() < 0.01, //%1 ihttimalle lamba bozuk sinyali gonderiyoruz
		Location:         inter.Location,
	}
	select {
	case eventQueue <- event:
	default:
		droppedCount.Add(1)
	}
}

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
		isMain := rnd.Float64() < 0.35 //%35 ihtimalle merkezi bir yer olsun diye ihtimal verdik
		var lat, lng float64
		if isMain {
			lat = 37.8714 + (rnd.Float64()-0.5)*0.02
			lng = 32.4846 + (rnd.Float64()-0.5)*0.02
		} else {
			lat = minLat + rnd.Float64()*(maxLat-minLat)
			lng = minLng + rnd.Float64()*(maxLng-minLng)
		}
		zones[i] = zoneInfo{id: fmt.Sprintf("Z-%04d", i), lat: lat, lng: lng} //her zone icin bir id verilir
	}
	zonePool = zones //hazirlanan liste global bi degiskene atanir
}

// rand komutu threadsafe degildir yani aynı anda birden fazla goroutine tarafından kullanilirsa hatali islem yapilabilir race condition olusur bu yuzden mutex ile kilitliyoruz
var densityRnd = newRnd()
var densityRndMu sync.Mutex

func GenerateDensity() domain.Density {
	zonePoolOnce.Do(initZonePool)

	densityRndMu.Lock()
	rnd := densityRnd
	zone := zonePool[rnd.Intn(len(zonePool))]
	vehicleCount := rnd.Intn(250)
	avgSpeedBase := 60.0 - float64(vehicleCount)*0.15
	avgSpeedJitter := (rnd.Float64() - 0.5) * 10
	cars := int(float64(vehicleCount) * (0.75 + (rnd.Float64()-0.5)*0.1))
	buses := int(float64(vehicleCount) * (0.08 + rnd.Float64()*0.05)) 
	densityRndMu.Unlock()

	avgSpeed := 0.0
	if vehicleCount > 0 {
		base := avgSpeedBase
		if base < 5 {
			base = 5
		}
		avgSpeed = base + avgSpeedJitter
	}
	bikes := vehicleCount - cars - buses
	if bikes < 0 {
		bikes = 0
	}

	return domain.Density{
		ZoneID:          zone.id,
		VehicleCount:    vehicleCount,
		PedestrianCount: func() int { densityRndMu.Lock(); v := densityRnd.Intn(80); densityRndMu.Unlock(); return v }(),
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

var violationRnd = newRnd()
var violationRndMu sync.Mutex

func GenerateSpeedViolation() domain.SpeedViolation {
	radarPoolOnce.Do(initRadarPool)

	violationRndMu.Lock()
	rnd := violationRnd
	limit := speedZones[rnd.Intn(len(speedZones))]
	excess := rnd.Intn(30) + 1
	if rnd.Float64() < 0.2 {
		excess = 30 + rnd.Intn(40)
	}
	radar := radarPool[rnd.Intn(len(radarPool))]
	plate := plateLetters[rnd.Intn(len(plateLetters))]
	plateNum := rnd.Intn(999)
	dir := allDirections[rnd.Intn(len(allDirections))]
	laneID := rnd.Intn(3) + 1
	violationRndMu.Unlock()

	return domain.SpeedViolation{
		VehicleID: fmt.Sprintf("42-%s-%03d", plate, plateNum),
		Speed:     limit + excess,
		Limit:     limit,
		LaneID:    laneID,
		Direction: dir,
		Location:  radar,
	}
}
