package consumer

import (
	"context"
	"encoding/json"
	"log"
	"sync"
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

// ─── Batch Writer ─────────────────────────────────────────────────────────────
// FIX: Tek tek INSERT yerine batch insert.
// Her 500ms'de bir veya 500 kayıt dolunca flush yapar.

const (
	densityBatchSize  = 500
	densityFlushEvery = 500 * time.Millisecond
)

type densityBatchWriter struct {
	mu     sync.Mutex
	buf    []Density
	conn   clickhouse.Conn
	ticker *time.Ticker
}

func newDensityBatch(conn clickhouse.Conn) *densityBatchWriter {
	b := &densityBatchWriter{
		buf:    make([]Density, 0, densityBatchSize),
		conn:   conn,
		ticker: time.NewTicker(densityFlushEvery),
	}
	go b.runFlusher()
	return b
}

func (b *densityBatchWriter) add(d Density) {
	b.mu.Lock()
	b.buf = append(b.buf, d)
	shouldFlush := len(b.buf) >= densityBatchSize
	b.mu.Unlock()

	if shouldFlush {
		b.flush()
	}
}

func (b *densityBatchWriter) runFlusher() {
	for range b.ticker.C {
		b.flush()
	}
}

func (b *densityBatchWriter) flush() {
	b.mu.Lock()
	if len(b.buf) == 0 {
		b.mu.Unlock()
		return
	}
	items := make([]Density, len(b.buf))
	copy(items, b.buf)
	b.buf = b.buf[:0]
	b.mu.Unlock()

	batch, err := b.conn.PrepareBatch(context.Background(), `
		INSERT INTO density (
			zone_id, vehicle_count, pedestrian_count, avg_speed,
			bus, car, bike, lat, lng, timestamp
		)
	`)
	if err != nil {
		log.Printf("Density batch prepare hatası: %v", err)
		return
	}

	for _, d := range items {
		ts, err := time.Parse(time.RFC3339, d.Timestamp)
		if err != nil {
			ts = time.Now()
		}
		if err := batch.Append(
			d.ZoneID,
			int32(d.VehicleCount),
			int32(d.PedestrianCount),
			d.AvgSpeed,
			int32(d.VehicleTypes.Bus),
			int32(d.VehicleTypes.Car),
			int32(d.VehicleTypes.Bike),
			d.Location.Lat,
			d.Location.Lng,
			ts,
		); err != nil {
			log.Printf("Density batch append hatası: %v", err)
		}
	}

	if err := batch.Send(); err != nil {
		log.Printf("Density batch send hatası: %v", err)
	}
}

// ─── Global batch instance ────────────────────────────────────────────────────

var (
	densityBatch     *densityBatchWriter
	densityBatchOnce sync.Once
)

func HandleDensity(conn clickhouse.Conn, message string) {
	densityBatchOnce.Do(func() {
		densityBatch = newDensityBatch(conn)
	})

	var data Density
	if err := json.Unmarshal([]byte(message), &data); err != nil {
		log.Printf("Density JSON parse hatası: %v", err)
		return
	}

	densityBatch.add(data)
}
