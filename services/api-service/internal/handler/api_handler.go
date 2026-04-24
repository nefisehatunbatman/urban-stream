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
	data, err := h.queries.GetPredictions(channel)
	if err != nil {
		pkg.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	pkg.JSON(w, http.StatusOK, data)
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

func getDays(r *http.Request, fallback int) int {
	if v := r.URL.Query().Get("days"); v != "" {
		if i, err := strconv.Atoi(v); err == nil && i > 0 {
			return i
		}
	}
	return fallback
}
