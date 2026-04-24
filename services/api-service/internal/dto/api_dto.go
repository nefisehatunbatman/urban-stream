package dto

// --- Density ---
type DensityRecord struct {
	DS             string  `json:"ds"`
	AvgVehicles    float64 `json:"avg_vehicles"`
	AvgSpeed       float64 `json:"avg_speed"`
	AvgPedestrians float64 `json:"avg_pedestrians"`
	TotalRecords   uint64  `json:"total_records"`
}

type HourlyDensity struct {
	DayOfWeek   uint8   `json:"day_of_week"`
	Hour        uint8   `json:"hour"`
	AvgVehicles float64 `json:"avg_vehicles"`
}

// --- Traffic Lights ---
type TrafficLightRecord struct {
	DS               string  `json:"ds"`
	TotalCount       uint64  `json:"total_count"`
	MalfunctionCount uint64  `json:"malfunction_count"`
	MalfunctionRate  float64 `json:"malfunction_rate"`
}

// --- Speed Violations ---
type SpeedViolationRecord struct {
	DS             string  `json:"ds"`
	ViolationCount uint64  `json:"violation_count"`
	AvgSpeed       float64 `json:"avg_speed"`
	MaxSpeed       float64 `json:"max_speed"`
}

// --- Predictions ---
type PredictionRecord struct {
	Channel   string  `json:"channel"`
	DS        string  `json:"ds"`
	Yhat      float64 `json:"yhat"`
	YhatLower float64 `json:"yhat_lower"`
	YhatUpper float64 `json:"yhat_upper"`
	Metric    string  `json:"metric"`
}

// --- Analysis ---
type AnalysisReport struct {
	Channel   string  `json:"channel"`
	Metric    string  `json:"metric"`
	Value     float64 `json:"value"`
	Label     string  `json:"label"`
	CreatedAt string  `json:"created_at"`
}

// --- Live (WebSocket) ---
type LiveMessage struct {
	Channel string      `json:"channel"`
	Data    interface{} `json:"data"`
}
