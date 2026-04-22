package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type HealthHandler struct {
	db *pgxpool.Pool
}

func NewHealthHandler(db *pgxpool.Pool) *HealthHandler {
	return &HealthHandler{db: db}
}

func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	dbOK := true
	if err := h.db.Ping(ctx); err != nil {
		dbOK = false
	}

	status := "healthy"
	httpCode := http.StatusOK
	if !dbOK {
		status = "degraded"
		httpCode = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(httpCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   status,
		"service":  "bodhassess-api",
		"version":  "1.0.0-phase1",
		"database": dbOK,
		"time":     time.Now().UTC(),
	})
}
