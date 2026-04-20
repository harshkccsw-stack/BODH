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

type SessionsTakeHandler struct {
	db *pgxpool.Pool
}

func NewSessionsTakeHandler(db *pgxpool.Pool) *SessionsTakeHandler {
	return &SessionsTakeHandler{db: db}
}

// --- GET /sessions/{id}/items ---

type takeSessionInfo struct {
	ID               string  `json:"id"`
	Status           string  `json:"status"`
	Language         string  `json:"language"`
	StartedAt        *string `json:"started_at"`
	CurrentItemIndex int     `json:"current_item_index"`
	ThetaEstimate    float64 `json:"theta_estimate"`
	TimeLimitMinutes *int    `json:"time_limit_minutes"`
}

type takeInstrumentInfo struct {
	Name            string `json:"name"`
	ShortName       string `json:"short_name"`
	DurationMinutes *int   `json:"duration_minutes"`
	IsAdaptive      bool   `json:"is_adaptive"`
}

type takeItemRow struct {
	ID            string      `json:"id"`
	SubDomain     *string     `json:"sub_domain"`
	Format        string      `json:"format"`
	Stem          string      `json:"stem"`
	Options       interface{} `json:"options"`
	SequenceOrder *int        `json:"sequence_order"`
	RiskFlag      bool        `json:"clinical_risk_flag"`
}

func (h *SessionsTakeHandler) GetItems(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	var instrumentID uuid.UUID
	var status, language string
	var startedAt *time.Time
	var timeLimitMinutes *int
	var currentItemIndex int
	var thetaEstimate float64

	err := h.db.QueryRow(ctx,
		`SELECT instrument_id, status, language, started_at, time_limit_minutes, current_item_index, theta_estimate
		FROM sessions WHERE id = $1`, id,
	).Scan(&instrumentID, &status, &language, &startedAt, &timeLimitMinutes, &currentItemIndex, &thetaEstimate)
	if err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}

	session := takeSessionInfo{
		ID:               id,
		Status:           status,
		Language:         language,
		CurrentItemIndex: currentItemIndex,
		ThetaEstimate:    thetaEstimate,
		TimeLimitMinutes: timeLimitMinutes,
	}
	if startedAt != nil {
		s := startedAt.Format(time.RFC3339)
		session.StartedAt = &s
	}

	var instr takeInstrumentInfo
	var shortName *string
	err = h.db.QueryRow(ctx,
		`SELECT name, short_name, duration_minutes, is_adaptive FROM instruments WHERE id = $1`, instrumentID,
	).Scan(&instr.Name, &shortName, &instr.DurationMinutes, &instr.IsAdaptive)
	if err != nil {
		http.Error(w, `{"error":"instrument not found"}`, http.StatusInternalServerError)
		return
	}
	if shortName != nil {
		instr.ShortName = *shortName
	}

	rows, err := h.db.Query(ctx,
		`SELECT id, sub_domain, item_format, stem, options, sequence_order, clinical_risk_flag
		FROM items WHERE instrument_id = $1 ORDER BY sequence_order NULLS LAST, created_at`, instrumentID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to query items"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []takeItemRow{}
	for rows.Next() {
		var it takeItemRow
		var optionsRaw []byte
		if err := rows.Scan(&it.ID, &it.SubDomain, &it.Format, &it.Stem, &optionsRaw, &it.SequenceOrder, &it.RiskFlag); err != nil {
			continue
		}
		if optionsRaw != nil {
			json.Unmarshal(optionsRaw, &it.Options)
		}
		items = append(items, it)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session":    session,
		"instrument": instr,
		"items":      items,
	})
}

// --- POST /sessions/{id}/start ---

func (h *SessionsTakeHandler) Start(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	var status string
	var startedAt *time.Time
	err := h.db.QueryRow(ctx,
		`UPDATE sessions
		SET status='IN_PROGRESS', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
		WHERE id = $1 AND status IN ('CREATED','INVITED')
		RETURNING status, started_at`, id,
	).Scan(&status, &startedAt)

	if err != nil {
		// Already in progress or completed — still return current state
		err2 := h.db.QueryRow(ctx,
			`SELECT status, started_at FROM sessions WHERE id = $1`, id,
		).Scan(&status, &startedAt)
		if err2 != nil {
			http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
			return
		}
	}

	resp := map[string]interface{}{
		"id":     id,
		"status": status,
	}
	if startedAt != nil {
		resp["started_at"] = startedAt.Format(time.RFC3339)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// --- POST /sessions/{id}/responses ---

type saveResponseRequest struct {
	ItemID         string      `json:"item_id"`
	ResponseValue  interface{} `json:"response_value"`
	ResponseTimeMs *int        `json:"response_time_ms"`
	ItemSequence   *int        `json:"item_sequence"`
}

func (h *SessionsTakeHandler) SaveResponse(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	sessionID := chi.URLParam(r, "id")

	var req saveResponseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.ItemID == "" {
		http.Error(w, `{"error":"item_id is required"}`, http.StatusBadRequest)
		return
	}

	// Fetch item's clinical_risk_flag for scoring logic.
	var itemRiskFlag bool
	if err := h.db.QueryRow(ctx, `SELECT clinical_risk_flag FROM items WHERE id = $1`, req.ItemID).Scan(&itemRiskFlag); err != nil {
		http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
		return
	}

	// Extract a numeric `value` from the response_value if present.
	var score *float64
	var numericValue *float64
	if valMap, ok := req.ResponseValue.(map[string]interface{}); ok {
		if v, exists := valMap["value"]; exists {
			switch n := v.(type) {
			case float64:
				numericValue = &n
				score = &n
			case int:
				f := float64(n)
				numericValue = &f
				score = &f
			}
		}
	}

	isRiskFlagged := false
	if itemRiskFlag && numericValue != nil && *numericValue >= 2 {
		isRiskFlagged = true
	}

	valueJSON, err := json.Marshal(req.ResponseValue)
	if err != nil {
		http.Error(w, `{"error":"invalid response_value"}`, http.StatusBadRequest)
		return
	}

	// Delete-then-insert upsert (no unique index on session/item).
	if _, err := h.db.Exec(ctx, `DELETE FROM responses WHERE session_id = $1 AND item_id = $2`, sessionID, req.ItemID); err != nil {
		http.Error(w, `{"error":"failed to clear prior response"}`, http.StatusInternalServerError)
		return
	}

	responseID := uuid.New()
	var createdAt time.Time
	err = h.db.QueryRow(ctx,
		`INSERT INTO responses (id, session_id, item_id, response_value, score, response_time_ms, item_sequence, is_risk_flagged)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING created_at`,
		responseID, sessionID, req.ItemID, valueJSON, score, req.ResponseTimeMs, req.ItemSequence, isRiskFlagged,
	).Scan(&createdAt)
	if err != nil {
		http.Error(w, `{"error":"failed to save response: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Update session progress markers.
	if req.ItemSequence != nil {
		h.db.Exec(ctx,
			`UPDATE sessions SET last_auto_save = NOW(), current_item_index = $1, updated_at = NOW() WHERE id = $2`,
			*req.ItemSequence, sessionID,
		)
	} else {
		h.db.Exec(ctx, `UPDATE sessions SET last_auto_save = NOW(), updated_at = NOW() WHERE id = $1`, sessionID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":               responseID,
		"saved_at":         createdAt.Format(time.RFC3339),
		"is_risk_flagged":  isRiskFlagged,
	})
}

// --- POST /sessions/{id}/complete ---

func (h *SessionsTakeHandler) Complete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	var status string
	var completedAt *time.Time
	err := h.db.QueryRow(ctx,
		`UPDATE sessions SET status='COMPLETED', completed_at = NOW(), updated_at = NOW()
		WHERE id = $1 RETURNING status, completed_at`, id,
	).Scan(&status, &completedAt)
	if err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}

	var rawScore *float64
	var responseCount int
	h.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(score), 0)::float8, COUNT(*) FROM responses WHERE session_id = $1`, id,
	).Scan(&rawScore, &responseCount)

	resp := map[string]interface{}{
		"id":             id,
		"status":         status,
		"response_count": responseCount,
		"raw_score":      rawScore,
	}
	if completedAt != nil {
		resp["completed_at"] = completedAt.Format(time.RFC3339)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
