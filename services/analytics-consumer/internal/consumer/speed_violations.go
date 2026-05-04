package consumer

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

type SpeedViolation struct {
	VehicleID string  `json:"vehicle_id"`
	Speed     float64 `json:"speed"`
	Limit     float64 `json:"limit"`
	LaneID    int     `json:"lane_id"`
	Direction string  `json:"direction"`
	Location  struct {
		Lat float64 `json:"lat"`
		Lng float64 `json:"lng"`
	} `json:"location"`
}

// ─── Batch Writer ─────────────────────────────────────────────────────────────
// FIX: Tek tek INSERT yerine batch insert.
// Her 500ms'de bir veya 500 kayıt dolunca flush yapar.

const (
	violationBatchSize  = 500
	violationFlushEvery = 500 * time.Millisecond
)

type speedViolationBatch struct {
	mu     sync.Mutex
	buf    []SpeedViolation
	conn   clickhouse.Conn
	ticker *time.Ticker
}

func newSpeedViolationBatch(conn clickhouse.Conn) *speedViolationBatch {
	b := &speedViolationBatch{
		buf:    make([]SpeedViolation, 0, violationBatchSize),
		conn:   conn,
		ticker: time.NewTicker(violationFlushEvery),
	}
	go b.runFlusher()
	return b
}

func (b *speedViolationBatch) add(d SpeedViolation) {
	b.mu.Lock()
	b.buf = append(b.buf, d)
	shouldFlush := len(b.buf) >= violationBatchSize
	b.mu.Unlock()

	if shouldFlush {
		b.flush()
	}
}

func (b *speedViolationBatch) runFlusher() {
	for range b.ticker.C {
		b.flush()
	}
}

func (b *speedViolationBatch) flush() {
	b.mu.Lock()
	if len(b.buf) == 0 {
		b.mu.Unlock()
		return
	}
	items := make([]SpeedViolation, len(b.buf))
	copy(items, b.buf)
	b.buf = b.buf[:0]
	b.mu.Unlock()

	batch, err := b.conn.PrepareBatch(context.Background(), `
		INSERT INTO speed_violations (
			vehicle_id, speed, speed_limit, lane_id,
			direction, lat, lng
		)
	`)
	if err != nil {
		log.Printf("SpeedViolation batch prepare hatası: %v", err)
		return
	}

	for _, d := range items {
		if err := batch.Append(
			d.VehicleID,
			d.Speed,
			d.Limit,
			int32(d.LaneID),
			d.Direction,
			d.Location.Lat,
			d.Location.Lng,
		); err != nil {
			log.Printf("SpeedViolation batch append hatası: %v", err)
		}
	}

	if err := batch.Send(); err != nil {
		log.Printf("SpeedViolation batch send hatası: %v", err)
	}
}

// ─── Global batch instance ────────────────────────────────────────────────────

var (
	violationBatch     *speedViolationBatch
	violationBatchOnce sync.Once
)

func HandleSpeedViolations(conn clickhouse.Conn, message string) {
	violationBatchOnce.Do(func() {
		violationBatch = newSpeedViolationBatch(conn)
	})

	var data SpeedViolation
	if err := json.Unmarshal([]byte(message), &data); err != nil {
		log.Printf("SpeedViolation JSON parse hatası: %v", err)
		return
	}

	violationBatch.add(data)
}
