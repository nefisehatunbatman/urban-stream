package handler

import (
	"net/http"
	"strconv"

	"api-service/internal/pkg"
	"api-service/internal/service/commands"
	"api-service/internal/service/queries"
)

type APIHandler struct {
	queries *queries.APIQueries
	hub     *commands.Hub
}

func NewAPIHandler(q *queries.APIQueries, hub *commands.Hub) *APIHandler {
	return &APIHandler{queries: q, hub: hub}
}

func (h *APIHandler) GetDensity(w http.ResponseWriter, r *http.Request) {
	days := getDays(r, 30)
	data, err := h.queries.GetDensity(days)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
}

func (h *APIHandler) GetHourlyDensity(w http.ResponseWriter, r *http.Request) {
	days := getDays(r, 30)
	data, err := h.queries.GetHourlyDensity(days)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
}

func (h *APIHandler) GetTrafficLights(w http.ResponseWriter, r *http.Request) {
	days := getDays(r, 30)
	data, err := h.queries.GetTrafficLights(days)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
}

func (h *APIHandler) GetSpeedViolations(w http.ResponseWriter, r *http.Request) {
	days := getDays(r, 30)
	data, err := h.queries.GetSpeedViolations(days)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
}

func (h *APIHandler) GetPredictions(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	if channel == "" {
		channel = "density"
	}
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		metric = defaultPredictionMetric(channel)
	}
	data, err := h.queries.GetPredictions(channel, metric)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
}

func defaultPredictionMetric(channel string) string {
	switch channel {
	case "speed_violations":
		return "violation_count"
	case "traffic_lights":
		return "malfunction_rate"
	default:
		return "avg_vehicles"
	}
}

func (h *APIHandler) GetAnalysis(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	if channel == "" {
		channel = "density"
	}
	data, err := h.queries.GetAnalysisReports(channel)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
}

func (h *APIHandler) LiveWS(w http.ResponseWriter, r *http.Request) {
	h.hub.ServeWS(w, r)
}

// ─── Stream Kontrol ───────────────────────────────────────────────────────────

// PauseStream Kafka'dan broadcast'e veri akışını durdurur.
// ?channel=city.traffic_lights gibi belirli bir kanal verilebilir.
// Verilmezse tüm kanallar durur.
// POST /api/stream/pause
func (h *APIHandler) PauseStream(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	if channel != "" {
		h.hub.PauseChannel(channel)
		pkg.JSON(w, http.StatusOK, map[string]string{"status": "paused", "channel": channel})
		return
	}
	h.hub.Pause()
	pkg.JSON(w, http.StatusOK, map[string]string{"status": "paused", "channel": "all"})
}

// ResumeStream veri akışını devam ettirir.
// POST /api/stream/resume
func (h *APIHandler) ResumeStream(w http.ResponseWriter, r *http.Request) {
	channel := r.URL.Query().Get("channel")
	if channel != "" {
		h.hub.ResumeChannel(channel)
		pkg.JSON(w, http.StatusOK, map[string]string{"status": "running", "channel": channel})
		return
	}
	h.hub.Resume()
	pkg.JSON(w, http.StatusOK, map[string]string{"status": "running", "channel": "all"})
}

// StreamStatus akışın mevcut durumunu döner.
// GET /api/stream/status
func (h *APIHandler) StreamStatus(w http.ResponseWriter, r *http.Request) {
	pkg.JSON(w, http.StatusOK, map[string]any{
		"traffic_lights":   h.hub.IsChannelPaused("city.traffic_lights"),
		"density":          h.hub.IsChannelPaused("city.density"),
		"speed_violations": h.hub.IsChannelPaused("city.speed_violations"),
	})
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

func getDays(r *http.Request, fallback int) int {
	if v := r.URL.Query().Get("days"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 {
			return i
		}
	}
	return fallback
}
