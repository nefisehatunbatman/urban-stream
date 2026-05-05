package commands

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"api-service/internal/dto"

	"github.com/gorilla/websocket"
	"github.com/segmentio/kafka-go"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

// ─── Kanal Sayacı ─────────────────────────────────────────────────────────────

type channelCounter struct {
	trafficLights  atomic.Int64
	density        atomic.Int64
	speedViolation atomic.Int64
}

func (c *channelCounter) inc(topic string) {
	switch topic {
	case "city.traffic_lights":
		c.trafficLights.Add(1)
	case "city.density":
		c.density.Add(1)
	case "city.speed_violations":
		c.speedViolation.Add(1)
	}
}

func (c *channelCounter) swapAll() (tl, d, sv int64) {
	return c.trafficLights.Swap(0),
		c.density.Swap(0),
		c.speedViolation.Swap(0)
}

// ─── Hub ──────────────────────────────────────────────────────────────────────

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex

	counter channelCounter

	// Kanal bazlı pause — her topic bağımsız durdurulabilir
	pausedChannels sync.Map // map[string]bool
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 2000),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) PauseChannel(channel string) {
	h.pausedChannels.Store(channel, true)
	log.Printf("[hub] kanal duraklatıldı: %s", channel)
}

func (h *Hub) ResumeChannel(channel string) {
	h.pausedChannels.Store(channel, false)
	log.Printf("[hub] kanal devam ediyor: %s", channel)
}

func (h *Hub) IsChannelPaused(channel string) bool {
	v, ok := h.pausedChannels.Load(channel)
	if !ok {
		return false
	}
	return v.(bool)
}

// Pause/Resume/IsPaused — geriye dönük uyumluluk için tüm kanalları etkiler
func (h *Hub) Pause() {
	for _, t := range []string{"city.traffic_lights", "city.density", "city.speed_violations"} {
		h.PauseChannel(t)
	}
}

func (h *Hub) Resume() {
	for _, t := range []string{"city.traffic_lights", "city.density", "city.speed_violations"} {
		h.ResumeChannel(t)
	}
}

func (h *Hub) IsPaused() bool {
	paused := true
	for _, t := range []string{"city.traffic_lights", "city.density", "city.speed_violations"} {
		if !h.IsChannelPaused(t) {
			paused = false
		}
	}
	return paused
}

// ─── Logger ───────────────────────────────────────────────────────────────────

func (h *Hub) StartThroughputLogger() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		tl, d, sv := h.counter.swapAll()
		log.Printf(
			"[ws-throughput] traffic_lights: %d/s | density: %d/s | speed_violations: %d/s | toplam: %d/s",
			tl, d, sv, tl+d+sv,
		)
	}
}

// ─── Run ──────────────────────────────────────────────────────────────────────

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("WebSocket client bağlandı, toplam: %d", len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade hatası: %v", err)
		return
	}

	client := &Client{conn: conn, send: make(chan []byte, 256)}
	h.register <- client

	go func() {
		defer func() {
			h.unregister <- client
			conn.Close()
		}()
		for msg := range client.send {
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	go func() {
		defer func() {
			h.unregister <- client
			conn.Close()
		}()
		conn.SetReadLimit(512)
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			return nil
		})
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()
}

// ─── Kafka Consumer ───────────────────────────────────────────────────────────

func (h *Hub) StartKafkaConsumer(broker string) {
	topics := []string{"city.traffic_lights", "city.density", "city.speed_violations"}

	for _, topic := range topics {
		go func(t string) {
			r := kafka.NewReader(kafka.ReaderConfig{
				Brokers: []string{broker},
				Topic:   t,
				GroupID: "api-ws-" + t,
				MaxWait: 50 * time.Millisecond,
			})
			defer r.Close()

			log.Printf("Kafka consumer başladı: %s", t)

			for {
				msg, err := r.ReadMessage(context.Background())
				if err != nil {
					log.Printf("Kafka okuma hatası (%s): %v", t, err)
					time.Sleep(2 * time.Second)
					continue
				}

				// Kanal bazlı pause kontrolü
				if h.IsChannelPaused(t) {
					continue
				}

				live := dto.LiveMessage{
					Channel: t,
					Data:    json.RawMessage(msg.Value),
				}
				bytes, _ := json.Marshal(live)

				h.counter.inc(t)
				h.broadcast <- bytes
			}
		}(topic)
	}
}
