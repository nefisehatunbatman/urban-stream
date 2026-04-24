package commands

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
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

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

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

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade hatası: %v", err)
		return
	}

	client := &Client{conn: conn, send: make(chan []byte, 256)}
	h.register <- client

	// Yazma goroutine
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

	// Okuma goroutine (ping/pong için)
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

// KafkaConsumer — Kafka'dan okuyup hub'a broadcast eder
func (h *Hub) StartKafkaConsumer(broker string) {
	topics := []string{"city.traffic_lights", "city.density", "city.speed_violations"}

	for _, topic := range topics {
		go func(t string) {
			r := kafka.NewReader(kafka.ReaderConfig{
				Brokers: []string{broker},
				Topic:   t,
				GroupID: "api-service-ws",
				MaxWait: 500 * time.Millisecond,
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

				live := dto.LiveMessage{
					Channel: t,
					Data:    json.RawMessage(msg.Value),
				}
				bytes, _ := json.Marshal(live)
				h.broadcast <- bytes
			}
		}(topic)
	}
}
