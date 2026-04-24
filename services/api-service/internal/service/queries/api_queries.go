package queries

import (
	"context"
	"fmt"
	"log"

	"api-service/internal/dto"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type APIQueries struct {
	db driver.Conn
}

func NewAPIQueries(db driver.Conn) *APIQueries {
	return &APIQueries{db: db}
}

func (q *APIQueries) GetDensity(days int) ([]dto.DensityRecord, error) {
	query := fmt.Sprintf(`
		SELECT
			toString(toDate(created_at)) AS ds,
			avg(vehicle_count)           AS avg_vehicles,
			avg(avg_speed)               AS avg_speed,
			avg(pedestrian_count)        AS avg_pedestrians,
			count()                      AS total_records
		FROM density
		WHERE created_at >= now() - INTERVAL %d DAY
		GROUP BY ds
		ORDER BY ds DESC
	`, days)

	rows, err := q.db.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []dto.DensityRecord
	for rows.Next() {
		var r dto.DensityRecord
		if err := rows.Scan(&r.DS, &r.AvgVehicles, &r.AvgSpeed, &r.AvgPedestrians, &r.TotalRecords); err != nil {
			log.Printf("density scan hatası: %v", err)
			continue
		}
		records = append(records, r)
	}
	return records, nil
}

func (q *APIQueries) GetHourlyDensity(days int) ([]dto.HourlyDensity, error) {
	query := fmt.Sprintf(`
		SELECT
			toDayOfWeek(created_at) AS day_of_week,
			toHour(created_at)      AS hour,
			avg(vehicle_count)      AS avg_vehicles
		FROM density
		WHERE created_at >= now() - INTERVAL %d DAY
		GROUP BY day_of_week, hour
		ORDER BY day_of_week, hour
	`, days)

	rows, err := q.db.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []dto.HourlyDensity
	for rows.Next() {
		var r dto.HourlyDensity
		if err := rows.Scan(&r.DayOfWeek, &r.Hour, &r.AvgVehicles); err != nil {
			continue
		}
		records = append(records, r)
	}
	return records, nil
}

func (q *APIQueries) GetTrafficLights(days int) ([]dto.TrafficLightRecord, error) {
	query := fmt.Sprintf(`
		SELECT
			toString(toDate(created_at))                        AS ds,
			count()                                             AS total_count,
			countIf(is_malfunctioning = 1)                      AS malfunction_count,
			countIf(is_malfunctioning = 1) / count()            AS malfunction_rate
		FROM traffic_lights
		WHERE created_at >= now() - INTERVAL %d DAY
		GROUP BY ds
		ORDER BY ds DESC
	`, days)

	rows, err := q.db.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []dto.TrafficLightRecord
	for rows.Next() {
		var r dto.TrafficLightRecord
		if err := rows.Scan(&r.DS, &r.TotalCount, &r.MalfunctionCount, &r.MalfunctionRate); err != nil {
			continue
		}
		records = append(records, r)
	}
	return records, nil
}

func (q *APIQueries) GetSpeedViolations(days int) ([]dto.SpeedViolationRecord, error) {
	query := fmt.Sprintf(`
		SELECT
			toString(toDate(created_at)) AS ds,
			count()                      AS violation_count,
			avg(speed)                   AS avg_speed,
			max(speed)                   AS max_speed
		FROM speed_violations
		WHERE created_at >= now() - INTERVAL %d DAY
		GROUP BY ds
		ORDER BY ds DESC
	`, days)

	rows, err := q.db.Query(context.Background(), query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []dto.SpeedViolationRecord
	for rows.Next() {
		var r dto.SpeedViolationRecord
		if err := rows.Scan(&r.DS, &r.ViolationCount, &r.AvgSpeed, &r.MaxSpeed); err != nil {
			continue
		}
		records = append(records, r)
	}
	return records, nil
}

func (q *APIQueries) GetPredictions(channel string) ([]dto.PredictionRecord, error) {
	query := `
		SELECT channel, toString(ds), yhat, yhat_lower, yhat_upper, metric
		FROM predictions
		WHERE channel = ?
		ORDER BY ds ASC
	`
	rows, err := q.db.Query(context.Background(), query, channel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []dto.PredictionRecord
	for rows.Next() {
		var r dto.PredictionRecord
		if err := rows.Scan(&r.Channel, &r.DS, &r.Yhat, &r.YhatLower, &r.YhatUpper, &r.Metric); err != nil {
			continue
		}
		records = append(records, r)
	}
	return records, nil
}

func (q *APIQueries) GetAnalysisReports(channel string) ([]dto.AnalysisReport, error) {
	query := `
		SELECT channel, metric, value, label,
		       toString(created_at) AS created_at
		FROM analysis_reports
		WHERE channel = ?
		ORDER BY created_at DESC
		LIMIT 50
	`
	rows, err := q.db.Query(context.Background(), query, channel)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []dto.AnalysisReport
	for rows.Next() {
		var r dto.AnalysisReport
		if err := rows.Scan(&r.Channel, &r.Metric, &r.Value, &r.Label, &r.CreatedAt); err != nil {
			continue
		}
		records = append(records, r)
	}
	return records, nil
}
