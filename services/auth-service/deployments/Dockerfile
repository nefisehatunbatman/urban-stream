FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o auth-service ./cmd/main.go

FROM alpine:3.19

WORKDIR /app

COPY --from=builder /app/auth-service .

# PEM key'ler runtime'da mount edilecek
VOLUME ["/app/keys"]

EXPOSE 8081

CMD ["./auth-service"]