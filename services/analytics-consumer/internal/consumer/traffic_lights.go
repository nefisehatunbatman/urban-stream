package consumer

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type TrafficLight struct {
	LampID           string    `json:"lamp_id"`
	Status           string    `json:"status"`
	// FIX: timing_remains kaldırıldı — models.go'da yok, JSON'dan gelmez
	IsMalfunctioning bool      `json:"is_malfunctioning"`
	IntersectionID   string    `json:"intersection_id"`
	ChangedAt        time.Time `json:"changed_at"` // FIX: eklendi
	Location         struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
}

// ─── Batch Writer ─────────────────────────────────────────────────────────────
// FIX: Tek tek INSERT yerine batch insert.
// 300 msg/s × tek INSERT = ClickHouse'u çökertir.
// Her 500ms'de bir veya 500 kayıt dolunca flush yapar.

const (
	trafficBatchSize    = 500
	trafficFlushEvery   = 500 * time.Millisecond
)

type trafficLightBatch struct {
	mu     sync.Mutex
	buf    []TrafficLight
	conn   clickhouse.Conn
	ticker *time.Ticker
}

func newTrafficLightBatch(conn clickhouse.Conn) *trafficLightBatch {
	b := &trafficLightBatch{
		buf:    make([]TrafficLight, 0, trafficBatchSize),
		conn:   conn,
		ticker: time.NewTicker(trafficFlushEvery),
	}
	go b.runFlusher()
	return b
}

func (b *trafficLightBatch) add(d TrafficLight) {
	b.mu.Lock()
	b.buf = append(b.buf, d)
	shouldFlush := len(b.buf) >= trafficBatchSize
	b.mu.Unlock()

	if shouldFlush {
		b.flush()
	}
}

func (b *trafficLightBatch) runFlusher() {
	for range b.ticker.C {
		b.flush()
	}
}

func (b *trafficLightBatch) flush() {
	b.mu.Lock()
	if len(b.buf) == 0 {
		b.mu.Unlock()
		return
	}
	items := make([]TrafficLight, len(b.buf))
	copy(items, b.buf)
	b.buf = b.buf[:0]
	b.mu.Unlock()

	batch, err := b.conn.PrepareBatch(context.Background(), `
		INSERT INTO traffic_lights (
			lamp_id, status, is_malfunctioning,
			intersection_id, lat, lng, changed_at
		)
	`)
	if err != nil {
		log.Printf("TrafficLight batch prepare hatası: %v", err)
		return
	}

	for _, d := range items {
		malFunc := uint8(0)
		if d.IsMalfunctioning {
			malFunc = 1
		}
		changedAt := d.ChangedAt
		if changedAt.IsZero() {
			changedAt = time.Now()
		}
		if err := batch.Append(
			d.LampID, d.Status, malFunc,
			d.IntersectionID, d.Location.Lat, d.Location.Lng, changedAt,
		); err != nil {
			log.Printf("TrafficLight batch append hatası: %v", err)
		}
	}

	if err := batch.Send(); err != nil {
		log.Printf("TrafficLight batch send hatası: %v", err)
	}
}

// ─── Global batch instance ────────────────────────────────────────────────────

var (
	trafficBatch     *trafficLightBatch
	trafficBatchOnce sync.Once
)

func HandleTrafficLights(conn clickhouse.Conn, message string) {
	trafficBatchOnce.Do(func() {
		trafficBatch = newTrafficLightBatch(conn)
	})

	var data TrafficLight
	if err := json.Unmarshal([]byte(message), &data); err != nil {
		log.Printf("TrafficLight JSON parse hatası: %v", err)
		return
	}

	trafficBatch.add(data)
}