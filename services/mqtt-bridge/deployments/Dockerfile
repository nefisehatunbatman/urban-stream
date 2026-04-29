# ── Stage 1: builder ───────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Bağımlılıkları önce kopyala (cache optimizasyonu)
COPY go.mod go.sum ./
RUN  go mod download

# Kaynak kodu kopyala ve derle
COPY cmd/ ./cmd/
RUN  CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o mqtt-bridge \
    ./cmd/main.go

# ── Stage 2: runtime ───────────────────────────────────────
FROM alpine:3.19

RUN  apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/mqtt-bridge .

ENV  KAFKA_BROKER=kafka:9092 \
    MQTT_BROKER=tcp://urban-emqx:1883

USER nobody

ENTRYPOINT ["./mqtt-bridge"]