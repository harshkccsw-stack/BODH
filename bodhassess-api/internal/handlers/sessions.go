package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SessionsHandler struct {
	db *pgxpool.Pool
}

func NewSessionsHandler(db *pgxpool.Pool) *SessionsHandler {
	return &SessionsHandler{db: db}
}

func (h *SessionsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	vertical := r.URL.Query().Get("vertical")
	status := r.URL.Query().Get("status")

	query := `SELECT s.id, s.vertical, s.language, s.status, s.is_proctored, s.trust_score, s.theta_estimate, s.started_at, s.completed_at, s.created_at,
		u.name as respondent_name, i.short_name as instrument_name
		FROM sessions s
		JOIN users u ON s.respondent_id = u.id
		JOIN instruments i ON s.instrument_id = i.id
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if vertical != "" {
		query += " AND s.vertical = $" + string(rune('0'+argIdx))
		args = append(args, vertical)
		argIdx++
	}
	if status != "" {
		query += " AND s.status = $" + string(rune('0'+argIdx))
		args = append(args, status)
		argIdx++
	}
	query += " ORDER BY s.created_at DESC LIMIT 50"

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to query sessions"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type SessionRow struct {
		ID             string   `json:"id"`
		Vertical       string   `json:"vertical"`
		Language       string   `json:"language"`
		Status         string   `json:"status"`
		IsProctored    bool     `json:"is_proctored"`
		TrustScore     *float64 `json:"trust_score"`
		ThetaEstimate  float64  `json:"theta_estimate"`
		StartedAt      *string  `json:"started_at"`
		CompletedAt    *string  `json:"completed_at"`
		CreatedAt      string   `json:"created_at"`
		RespondentName string   `json:"respondent_name"`
		InstrumentName *string  `json:"instrument_name"`
	}

	sessions := []SessionRow{}
	for rows.Next() {
		var s SessionRow
		var createdAt time.Time
		var startedAt, completedAt *time.Time
		err := rows.Scan(&s.ID, &s.Vertical, &s.Language, &s.Status, &s.IsProctored, &s.TrustScore, &s.ThetaEstimate, &startedAt, &completedAt, &createdAt, &s.RespondentName, &s.InstrumentName)
		if err != nil {
			continue
		}
		s.CreatedAt = createdAt.Format(time.RFC3339)
		if startedAt != nil {
			t := startedAt.Format(time.RFC3339)
			s.StartedAt = &t
		}
		if completedAt != nil {
			t := completedAt.Format(time.RFC3339)
			s.CompletedAt = &t
		}
		sessions = append(sessions, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  sessions,
		"total": len(sessions),
	})
}

type CreateSessionRequest struct {
	PractitionerID string `json:"practitioner_id"`
	RespondentID   string `json:"respondent_id"`
	InstrumentID   string `json:"instrument_id"`
	ConsentID      string `json:"consent_id"`
	Vertical       string `json:"vertical"`
	Language       string `json:"language"`
	IsProctored    bool   `json:"is_proctored"`
	TenantID       string `json:"tenant_id"`
}

func (h *SessionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.ConsentID == "" {
		http.Error(w, `{"error":"consent_id is required — DPDP compliance"}`, http.StatusBadRequest)
		return
	}

	sessionID := uuid.New()
	_, err := h.db.Exec(ctx,
		`INSERT INTO sessions (id, tenant_id, practitioner_id, respondent_id, instrument_id, consent_id, vertical, language, is_proctored, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CREATED')`,
		sessionID, req.TenantID, req.PractitionerID, req.RespondentID, req.InstrumentID, req.ConsentID, req.Vertical, req.Language, req.IsProctored,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create session: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":      sessionID,
		"status":  "CREATED",
		"message": "Session created. Send invitation to respondent.",
	})
}

func (h *SessionsHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	var vertical, language, status string
	var isProctored bool
	var thetaEstimate float64
	var createdAt time.Time

	err := h.db.QueryRow(ctx,
		`SELECT vertical, language, status, is_proctored, theta_estimate, created_at FROM sessions WHERE id = $1`, id,
	).Scan(&vertical, &language, &status, &isProctored, &thetaEstimate, &createdAt)

	if err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":             id,
		"vertical":       vertical,
		"language":       language,
		"status":         status,
		"is_proctored":   isProctored,
		"theta_estimate": thetaEstimate,
		"created_at":     createdAt.Format(time.RFC3339),
	})
}
