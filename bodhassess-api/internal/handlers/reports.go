package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReportsHandler struct {
	db *pgxpool.Pool
}

func NewReportsHandler(db *pgxpool.Pool) *ReportsHandler {
	return &ReportsHandler{db: db}
}

// --- List Reports ---

func (h *ReportsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	vertical := r.URL.Query().Get("vertical")
	status := r.URL.Query().Get("status")
	sessionID := r.URL.Query().Get("session_id")

	query := `SELECT r.id, r.session_id, r.vertical, r.report_type, r.status, r.scores, r.norm_group, r.diagnostic_codes, r.created_at,
		u.name AS respondent_name, i.short_name AS instrument_short, i.name AS instrument_name
		FROM reports r
		JOIN sessions s ON r.session_id = s.id
		JOIN users u ON s.respondent_id = u.id
		JOIN instruments i ON s.instrument_id = i.id
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if vertical != "" {
		query += fmt.Sprintf(" AND r.vertical = $%d", argIdx)
		args = append(args, vertical)
		argIdx++
	}
	if status != "" {
		query += fmt.Sprintf(" AND r.status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	}
	if sessionID != "" {
		query += fmt.Sprintf(" AND r.session_id = $%d", argIdx)
		args = append(args, sessionID)
		argIdx++
	}
	query += " ORDER BY r.created_at DESC LIMIT 100"

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to query reports"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ReportRow struct {
		ID              string      `json:"id"`
		SessionID       string      `json:"session_id"`
		Vertical        string      `json:"vertical"`
		ReportType      string      `json:"report_type"`
		Status          string      `json:"status"`
		Scores          interface{} `json:"scores"`
		NormGroup       *string     `json:"norm_group"`
		DiagnosticCodes []string    `json:"diagnostic_codes"`
		CreatedAt       string      `json:"created_at"`
		RespondentName  string      `json:"respondent_name"`
		InstrumentShort *string     `json:"instrument_short"`
		InstrumentName  string      `json:"instrument_name"`
	}

	reports := []ReportRow{}
	for rows.Next() {
		var rep ReportRow
		var createdAt time.Time
		var scores []byte
		var diagCodes []string
		err := rows.Scan(&rep.ID, &rep.SessionID, &rep.Vertical, &rep.ReportType, &rep.Status, &scores, &rep.NormGroup, &diagCodes, &createdAt, &rep.RespondentName, &rep.InstrumentShort, &rep.InstrumentName)
		if err != nil {
			continue
		}
		rep.CreatedAt = createdAt.Format(time.RFC3339)
		if scores != nil {
			json.Unmarshal(scores, &rep.Scores)
		}
		if diagCodes == nil {
			diagCodes = []string{}
		}
		rep.DiagnosticCodes = diagCodes
		reports = append(reports, rep)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  reports,
		"total": len(reports),
	})
}

// --- Get Report by ID ---

func (h *ReportsHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	query := `SELECT r.id, r.session_id, r.vertical, r.report_type, r.status, r.scores, r.norm_group, r.diagnostic_codes,
		r.risk_indicators, r.narrative_sections, r.reviewed_at, r.finalized_at, r.created_at,
		u.name AS respondent_name, i.short_name AS instrument_short, i.name AS instrument_name
		FROM reports r
		JOIN sessions s ON r.session_id = s.id
		JOIN users u ON s.respondent_id = u.id
		JOIN instruments i ON s.instrument_id = i.id
		WHERE r.id = $1`

	var (
		reportID, sessionID, vertical, reportType, status, respondentName, instrumentName string
		instrumentShort, normGroup                                                        *string
		scores, riskIndicators, narrativeSections                                         []byte
		diagCodes                                                                         []string
		reviewedAt, finalizedAt                                                           *time.Time
		createdAt                                                                         time.Time
	)

	err := h.db.QueryRow(ctx, query, id).Scan(
		&reportID, &sessionID, &vertical, &reportType, &status, &scores, &normGroup, &diagCodes,
		&riskIndicators, &narrativeSections, &reviewedAt, &finalizedAt, &createdAt,
		&respondentName, &instrumentShort, &instrumentName,
	)
	if err != nil {
		http.Error(w, `{"error":"report not found"}`, http.StatusNotFound)
		return
	}

	var scoresObj, riskObj, narrativeObj interface{}
	if scores != nil {
		json.Unmarshal(scores, &scoresObj)
	}
	if riskIndicators != nil {
		json.Unmarshal(riskIndicators, &riskObj)
	}
	if narrativeSections != nil {
		json.Unmarshal(narrativeSections, &narrativeObj)
	}
	if diagCodes == nil {
		diagCodes = []string{}
	}

	out := map[string]interface{}{
		"id":                 reportID,
		"session_id":         sessionID,
		"vertical":           vertical,
		"report_type":        reportType,
		"status":             status,
		"scores":             scoresObj,
		"norm_group":         normGroup,
		"diagnostic_codes":   diagCodes,
		"risk_indicators":    riskObj,
		"narrative_sections": narrativeObj,
		"created_at":         createdAt.Format(time.RFC3339),
		"respondent_name":    respondentName,
		"instrument_short":   instrumentShort,
		"instrument_name":    instrumentName,
	}
	if reviewedAt != nil {
		out["reviewed_at"] = reviewedAt.Format(time.RFC3339)
	} else {
		out["reviewed_at"] = nil
	}
	if finalizedAt != nil {
		out["finalized_at"] = finalizedAt.Format(time.RFC3339)
	} else {
		out["finalized_at"] = nil
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// --- Generate Report From Session ---

type GenerateReportRequest struct {
	SessionID string `json:"session_id"`
}

func (h *ReportsHandler) GenerateFromSession(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	var req GenerateReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.SessionID == "" {
		http.Error(w, `{"error":"session_id is required"}`, http.StatusBadRequest)
		return
	}

	// Check session exists and is COMPLETED
	var (
		tenantID uuid.UUID
		vertical string
		status   string
	)
	err := h.db.QueryRow(ctx,
		`SELECT tenant_id, vertical, status FROM sessions WHERE id = $1`, req.SessionID,
	).Scan(&tenantID, &vertical, &status)
	if err != nil {
		http.Error(w, `{"error":"session not found"}`, http.StatusBadRequest)
		return
	}
	if status != "COMPLETED" {
		http.Error(w, `{"error":"session is not COMPLETED — cannot generate report"}`, http.StatusBadRequest)
		return
	}

	// Compute simple scoring from responses
	var (
		rawScore  *float64
		itemCount int
	)
	err = h.db.QueryRow(ctx,
		`SELECT COALESCE(SUM(score), 0)::float8 AS raw_score, COUNT(*) AS item_count FROM responses WHERE session_id = $1`,
		req.SessionID,
	).Scan(&rawScore, &itemCount)
	if err != nil {
		http.Error(w, `{"error":"failed to compute scores: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	raw := 0.0
	if rawScore != nil {
		raw = *rawScore
	}
	// Placeholder t-score formula: t_score = 50 + raw
	tScore := 50.0 + raw

	// Count risk-flagged responses
	var flaggedCount int
	err = h.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM responses WHERE session_id = $1 AND is_risk_flagged = TRUE`,
		req.SessionID,
	).Scan(&flaggedCount)
	if err != nil {
		flaggedCount = 0
	}

	scores := map[string]interface{}{
		"raw":        raw,
		"t_score":    tScore,
		"item_count": itemCount,
	}
	scoresJSON, _ := json.Marshal(scores)

	narrative := map[string]interface{}{
		"summary": "Auto-generated summary for this assessment.",
	}
	narrativeJSON, _ := json.Marshal(narrative)

	risk := map[string]interface{}{
		"flagged_count": flaggedCount,
	}
	riskJSON, _ := json.Marshal(risk)

	reportID := uuid.New()
	_, err = h.db.Exec(ctx,
		`INSERT INTO reports (id, tenant_id, session_id, vertical, report_type, status, scores, narrative_sections, risk_indicators)
		VALUES ($1, $2, $3, $4, 'STANDARD', 'DRAFT', $5, $6, $7)`,
		reportID, tenantID, req.SessionID, vertical, scoresJSON, narrativeJSON, riskJSON,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create report: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         reportID,
		"session_id": req.SessionID,
		"status":     "DRAFT",
		"scores":     scores,
	})
}
