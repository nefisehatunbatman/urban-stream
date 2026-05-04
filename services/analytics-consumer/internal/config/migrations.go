package config

import (
	"context"
	"log"

	"github.com/ClickHouse/clickhouse-go/v2"
)

func RunMigrations(conn clickhouse.Conn) {

	queries := []string{
		// FIX 1: timing_remains kaldırıldı (models.go'da yok, JSON'dan gelmez)
		// FIX 2: changed_at eklendi (models.go'da ChangedAt time.Time var)
		`CREATE TABLE IF NOT EXISTS traffic_lights (
			lamp_id           String,
			status            String,
			is_malfunctioning UInt8,
			intersection_id   String,
			lat               Float64,
			lng               Float64,
			changed_at        DateTime,
			created_at        DateTime DEFAULT now()
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

		// predictions tablosu — ai-service buraya yazar, api-service buradan okur
		`CREATE TABLE IF NOT EXISTS predictions (
			channel    String,
			ds         Date,
			yhat       Float64,
			yhat_lower Float64,
			yhat_upper Float64,
			metric     String,
			created_at DateTime DEFAULT now()
		) ENGINE = ReplacingMergeTree(created_at)
		ORDER BY (channel, metric, ds)`,

		// analysis_reports tablosu — ai-service buraya yazar
		`CREATE TABLE IF NOT EXISTS analysis_reports (
			channel    String,
			metric     String,
			value      Float64,
			label      String,
			created_at DateTime DEFAULT now()
		) ENGINE = MergeTree()
		ORDER BY (created_at, channel, metric)`,
	}

	for _, query := range queries {
		if err := conn.Exec(context.Background(), query); err != nil {
			log.Fatalf("Migration hatası: %v\nQuery: %s", err, query)
		}
	}

	log.Println("ClickHouse migration'lar başarıyla tamamlandı")
}
