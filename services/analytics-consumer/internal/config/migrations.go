package config

import (
	"context"
	"log"

	"github.com/ClickHouse/clickhouse-go/v2"
)

func RunMigrations(conn clickhouse.Conn) {

	queries := []string{
		`CREATE TABLE IF NOT EXISTS traffic_lights (
			lamp_id          String,
			status           String,
			timing_remains   Int32,
			is_malfunctioning UInt8,
			intersection_id  String,
			lat              Float64,
			lng              Float64,
			created_at       DateTime DEFAULT now()
		) ENGINE = MergeTree()
		ORDER BY (created_at, lamp_id)`,

		`CREATE TABLE IF NOT EXISTS density (
			zone_id           String,
			vehicle_count     Int32,
			pedestrian_count  Int32,
			avg_speed         Float64,
			bus               Int32,
			car               Int32,
			bike              Int32,
			lat               Float64,
			lng               Float64,
			timestamp         DateTime,
			created_at        DateTime DEFAULT now()
		) ENGINE = MergeTree()
		ORDER BY (created_at, zone_id)`,

		`CREATE TABLE IF NOT EXISTS speed_violations (
			vehicle_id  String,
			speed       Float64,
			speed_limit Float64,
			lane_id     Int32,
			direction   String,
			lat         Float64,
			lng         Float64,
			created_at  DateTime DEFAULT now()
		) ENGINE = MergeTree()
		ORDER BY (created_at, vehicle_id)`,
	}

	for _, query := range queries {
		if err := conn.Exec(context.Background(), query); err != nil {
			log.Fatalf("Migration hatası: %v\nQuery: %s", err, query)
		}
	}

	log.Println("ClickHouse migration'lar başarıyla tamamlandı")
}
