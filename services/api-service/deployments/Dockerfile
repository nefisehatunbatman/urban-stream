FROM golang:1.24-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o api-service ./cmd/main.go

FROM alpine:3.19

WORKDIR /app

COPY --from=builder /app/api-service .

VOLUME ["/app/keys"]

EXPOSE 8082

CMD ["./api-service"]