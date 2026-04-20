package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AnalyticsHandler struct {
	db *pgxpool.Pool
}

func NewAnalyticsHandler(db *pgxpool.Pool) *AnalyticsHandler {
	return &AnalyticsHandler{db: db}
}

// --- Overview ---

func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	vertical := r.URL.Query().Get("vertical")

	// Build session-scoped filter
	sessionWhere := ""
	args := []interface{}{}
	if vertical != "" {
		sessionWhere = " WHERE vertical = $1"
		args = append(args, vertical)
	}

	var totalSessions, completedSessions, inProgress, totalRespondents int64
	err := h.db.QueryRow(ctx,
		`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'COMPLETED'),
			COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'),
			COUNT(DISTINCT respondent_id)
		FROM sessions`+sessionWhere, args...,
	).Scan(&totalSessions, &completedSessions, &inProgress, &totalRespondents)
	if err != nil {
		http.Error(w, `{"error":"failed to query session aggregates: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var totalReports int64
	reportsQuery := `SELECT COUNT(*) FROM reports`
	reportsArgs := []interface{}{}
	if vertical != "" {
		reportsQuery += ` WHERE vertical = $1`
		reportsArgs = append(reportsArgs, vertical)
	}
	if err := h.db.QueryRow(ctx, reportsQuery, reportsArgs...).Scan(&totalReports); err != nil {
		http.Error(w, `{"error":"failed to query reports: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var totalInstruments int64
	instrumentsQuery := `SELECT COUNT(*) FROM instruments WHERE is_published = TRUE`
	instrumentsArgs := []interface{}{}
	if vertical != "" {
		instrumentsQuery += ` AND vertical = $1`
		instrumentsArgs = append(instrumentsArgs, vertical)
	}
	if err := h.db.QueryRow(ctx, instrumentsQuery, instrumentsArgs...).Scan(&totalInstruments); err != nil {
		http.Error(w, `{"error":"failed to query instruments: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var riskFlaggedResponses int64
	riskQuery := `SELECT COUNT(*) FROM responses r`
	riskArgs := []interface{}{}
	if vertical != "" {
		riskQuery += ` JOIN sessions s ON r.session_id = s.id WHERE r.is_risk_flagged = TRUE AND s.vertical = $1`
		riskArgs = append(riskArgs, vertical)
	} else {
		riskQuery += ` WHERE r.is_risk_flagged = TRUE`
	}
	if err := h.db.QueryRow(ctx, riskQuery, riskArgs...).Scan(&riskFlaggedResponses); err != nil {
		http.Error(w, `{"error":"failed to query risk-flagged responses: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	var avgCompletionMinutes *float64
	avgQuery := `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/60)
		FROM sessions
		WHERE status = 'COMPLETED' AND completed_at IS NOT NULL AND started_at IS NOT NULL`
	avgArgs := []interface{}{}
	if vertical != "" {
		avgQuery += ` AND vertical = $1`
		avgArgs = append(avgArgs, vertical)
	}
	if err := h.db.QueryRow(ctx, avgQuery, avgArgs...).Scan(&avgCompletionMinutes); err != nil {
		http.Error(w, `{"error":"failed to query avg completion time: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	completionRate := 0.0
	if totalSessions > 0 {
		completionRate = float64(completedSessions) / float64(totalSessions)
	}

	avgMinutes := 0.0
	if avgCompletionMinutes != nil {
		avgMinutes = *avgCompletionMinutes
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"total_sessions":         totalSessions,
			"completed_sessions":     completedSessions,
			"in_progress":            inProgress,
			"completion_rate":        completionRate,
			"total_reports":          totalReports,
			"total_respondents":      totalRespondents,
			"total_instruments":      totalInstruments,
			"risk_flagged_responses": riskFlaggedResponses,
			"avg_completion_minutes": avgMinutes,
		},
	})
}

// --- Sessions By Vertical ---

func (h *AnalyticsHandler) SessionsByVertical(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx,
		`SELECT vertical,
			COUNT(*) AS total,
			SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
		FROM sessions
		GROUP BY vertical
		ORDER BY vertical`)
	if err != nil {
		http.Error(w, `{"error":"failed to query sessions by vertical"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type VerticalRow struct {
		Vertical  string `json:"vertical"`
		Total     int64  `json:"total"`
		Completed int64  `json:"completed"`
	}

	items := []VerticalRow{}
	for rows.Next() {
		var v VerticalRow
		if err := rows.Scan(&v.Vertical, &v.Total, &v.Completed); err != nil {
			continue
		}
		items = append(items, v)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": items,
	})
}

// --- Sessions Time Series ---

func (h *AnalyticsHandler) SessionsTimeSeries(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	daysStr := r.URL.Query().Get("days")
	days := 30
	if daysStr != "" {
		parsed, err := strconv.Atoi(daysStr)
		if err != nil || parsed < 1 || parsed > 365 {
			http.Error(w, `{"error":"days must be an integer between 1 and 365"}`, http.StatusBadRequest)
			return
		}
		days = parsed
	}

	// days is a validated integer (1-365), safe to interpolate directly.
	// Using make_interval with a parameter is an alternative, but fmt.Sprintf on
	// a sanitized int is clearer here since pgx does not accept an interval-literal
	// bound directly as `INTERVAL '$1 days'`.
	query := fmt.Sprintf(
		`SELECT DATE(created_at) AS day,
			COUNT(*) AS total,
			SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
		FROM sessions
		WHERE created_at >= NOW() - INTERVAL '%d days'
		GROUP BY day
		ORDER BY day`, days)

	rows, err := h.db.Query(ctx, query)
	if err != nil {
		http.Error(w, `{"error":"failed to query sessions timeseries"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type DayRow struct {
		Day       string `json:"day"`
		Total     int64  `json:"total"`
		Completed int64  `json:"completed"`
	}

	items := []DayRow{}
	for rows.Next() {
		var day time.Time
		var total, completed int64
		if err := rows.Scan(&day, &total, &completed); err != nil {
			continue
		}
		items = append(items, DayRow{
			Day:       day.Format("2006-01-02"),
			Total:     total,
			Completed: completed,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": items,
	})
}
