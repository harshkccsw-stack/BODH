package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PortalSessionsHandler struct {
	db *pgxpool.Pool
}

func NewPortalSessionsHandler(db *pgxpool.Pool) *PortalSessionsHandler {
	return &PortalSessionsHandler{db: db}
}

type portalSession struct {
	ID                 string                 `json:"id"`
	RespondentID       string                 `json:"respondentId"`
	RespondentName     string                 `json:"respondent"`
	RespondentEmail    string                 `json:"respondentEmail,omitempty"`
	Instrument         string                 `json:"instrument"`
	InstrumentFullName string                 `json:"instrumentFullName,omitempty"`
	Vertical           string                 `json:"vertical,omitempty"`
	Language           string                 `json:"language,omitempty"`
	Status             string                 `json:"status"`
	Score              string                 `json:"score,omitempty"`
	Answers            map[string]interface{} `json:"answers,omitempty"`
	MQTScores          map[string]float64     `json:"mqtScores,omitempty"`
	Demographics       map[string]interface{} `json:"demographics,omitempty"`
	GroupID            string                 `json:"groupId,omitempty"`
	GroupName          string                 `json:"groupName,omitempty"`
	ConsentID          string                 `json:"consentId,omitempty"`
	Proctoring         bool                   `json:"proctoring,omitempty"`
	InvitationSent     bool                   `json:"invitationSent,omitempty"`
	CreatedAt          string                 `json:"createdAt,omitempty"`
	CompletedAt        string                 `json:"completedAt,omitempty"`
}

func scanSession(rows pgx.Row) (portalSession, error) {
	var s portalSession
	var answersJSON, mqtJSON, demoJSON []byte
	var createdAt time.Time
	var completedAt *time.Time
	err := rows.Scan(
		&s.ID, &s.RespondentID, &s.RespondentName, &s.RespondentEmail,
		&s.Instrument, &s.InstrumentFullName, &s.Vertical, &s.Language,
		&s.Status, &s.Score, &answersJSON, &mqtJSON, &demoJSON,
		&s.GroupID, &s.GroupName, &s.ConsentID, &s.Proctoring, &s.InvitationSent,
		&createdAt, &completedAt,
	)
	if err != nil {
		return s, err
	}
	if len(answersJSON) > 0 {
		_ = json.Unmarshal(answersJSON, &s.Answers)
	}
	if len(mqtJSON) > 0 {
		_ = json.Unmarshal(mqtJSON, &s.MQTScores)
	}
	if len(demoJSON) > 0 {
		_ = json.Unmarshal(demoJSON, &s.Demographics)
	}
	s.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	if completedAt != nil {
		s.CompletedAt = completedAt.UTC().Format(time.RFC3339)
	}
	return s, nil
}

const sessionSelect = `
	SELECT id, respondent_id, respondent_name, COALESCE(respondent_email, ''),
	       instrument, COALESCE(instrument_full_name, ''), COALESCE(vertical, ''),
	       language, status, COALESCE(score, ''),
	       answers, mqt_scores, demographics,
	       COALESCE(group_id, ''), COALESCE(group_name, ''), COALESCE(consent_id, ''),
	       proctoring, invitation_sent, created_at, completed_at
	FROM portal_sessions`

func (h *PortalSessionsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	where := ""
	args := []interface{}{}
	if rid := r.URL.Query().Get("respondentId"); rid != "" {
		where = " WHERE respondent_id = $1"
		args = append(args, rid)
	}
	q := sessionSelect + where + " ORDER BY created_at DESC"
	rows, err := h.db.Query(ctx, q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]portalSession, 0)
	for rows.Next() {
		s, err := scanSession(rows)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *PortalSessionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	row := h.db.QueryRow(ctx, sessionSelect+" WHERE id = $1", id)
	s, err := scanSession(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, s)
}

func (h *PortalSessionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var p portalSession
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(p.ID) == "" || strings.TrimSpace(p.RespondentID) == "" ||
		strings.TrimSpace(p.Instrument) == "" {
		http.Error(w, "id, respondentId, instrument required", http.StatusBadRequest)
		return
	}
	if p.Status == "" {
		p.Status = "Active"
	}
	if p.Language == "" {
		p.Language = "English"
	}
	answers, _ := json.Marshal(p.Answers)
	mqts, _ := json.Marshal(p.MQTScores)
	demo, _ := json.Marshal(p.Demographics)

	_, err := h.db.Exec(ctx, `
		INSERT INTO portal_sessions (
			id, respondent_id, respondent_name, respondent_email,
			instrument, instrument_full_name, vertical, language,
			status, score, answers, mqt_scores, demographics,
			group_id, group_name, consent_id, proctoring, invitation_sent
		) VALUES (
			$1, $2, $3, NULLIF($4, ''),
			$5, NULLIF($6, ''), NULLIF($7, ''), $8,
			$9, NULLIF($10, ''), $11, $12, $13,
			NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''), $17, $18
		) ON CONFLICT (id) DO NOTHING`,
		p.ID, p.RespondentID, p.RespondentName, p.RespondentEmail,
		p.Instrument, p.InstrumentFullName, p.Vertical, p.Language,
		p.Status, p.Score, answers, mqts, demo,
		p.GroupID, p.GroupName, p.ConsentID, p.Proctoring, p.InvitationSent,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

type bulkCreateReq struct {
	Sessions []portalSession `json:"sessions"`
}

func (h *PortalSessionsHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	var req bulkCreateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	created := 0
	for _, p := range req.Sessions {
		if p.ID == "" || p.RespondentID == "" || p.Instrument == "" {
			continue
		}
		if p.Status == "" {
			p.Status = "Active"
		}
		if p.Language == "" {
			p.Language = "English"
		}
		answers, _ := json.Marshal(p.Answers)
		mqts, _ := json.Marshal(p.MQTScores)
		demo, _ := json.Marshal(p.Demographics)
		_, err := h.db.Exec(ctx, `
			INSERT INTO portal_sessions (
				id, respondent_id, respondent_name, respondent_email,
				instrument, instrument_full_name, vertical, language,
				status, score, answers, mqt_scores, demographics,
				group_id, group_name, consent_id, proctoring, invitation_sent
			) VALUES (
				$1, $2, $3, NULLIF($4, ''),
				$5, NULLIF($6, ''), NULLIF($7, ''), $8,
				$9, NULLIF($10, ''), $11, $12, $13,
				NULLIF($14, ''), NULLIF($15, ''), NULLIF($16, ''), $17, $18
			) ON CONFLICT (id) DO NOTHING`,
			p.ID, p.RespondentID, p.RespondentName, p.RespondentEmail,
			p.Instrument, p.InstrumentFullName, p.Vertical, p.Language,
			p.Status, p.Score, answers, mqts, demo,
			p.GroupID, p.GroupName, p.ConsentID, p.Proctoring, p.InvitationSent,
		)
		if err == nil {
			created++
		}
	}
	writeJSON(w, http.StatusCreated, map[string]int{"created": created})
}

func (h *PortalSessionsHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p portalSession
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	answers, _ := json.Marshal(p.Answers)
	mqts, _ := json.Marshal(p.MQTScores)
	demo, _ := json.Marshal(p.Demographics)

	// If client sent status=Completed but didn't set completed_at, set it now.
	var completedAt *time.Time
	if strings.EqualFold(p.Status, "Completed") {
		if p.CompletedAt != "" {
			if t, err := time.Parse(time.RFC3339, p.CompletedAt); err == nil {
				completedAt = &t
			}
		}
		if completedAt == nil {
			t := time.Now().UTC()
			completedAt = &t
		}
	}

	_, err := h.db.Exec(ctx, `
		UPDATE portal_sessions SET
			language = COALESCE(NULLIF($2, ''), language),
			status = COALESCE(NULLIF($3, ''), status),
			score = $4,
			answers = CASE WHEN $5::jsonb IS NOT NULL AND $5::jsonb != 'null'::jsonb THEN $5::jsonb ELSE answers END,
			mqt_scores = CASE WHEN $6::jsonb IS NOT NULL AND $6::jsonb != 'null'::jsonb THEN $6::jsonb ELSE mqt_scores END,
			demographics = CASE WHEN $7::jsonb IS NOT NULL AND $7::jsonb != 'null'::jsonb THEN $7::jsonb ELSE demographics END,
			completed_at = COALESCE($8, completed_at)
		WHERE id = $1`,
		id, p.Language, p.Status, nullableString(p.Score), answers, mqts, demo, completedAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	p.ID = id
	writeJSON(w, http.StatusOK, p)
}

func (h *PortalSessionsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM portal_sessions WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
