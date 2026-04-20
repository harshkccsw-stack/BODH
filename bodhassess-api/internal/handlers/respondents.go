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

type RespondentsHandler struct {
	db *pgxpool.Pool
}

func NewRespondentsHandler(db *pgxpool.Pool) *RespondentsHandler {
	return &RespondentsHandler{db: db}
}

type respondentPayload struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Email          string `json:"email"`
	DOB            string `json:"dob,omitempty"`
	Consent        string `json:"consent,omitempty"`
	SessionsCount  int    `json:"sessions_count,omitempty"`
	LastAssessment string `json:"last_assessment,omitempty"`
}

func (h *RespondentsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, email, COALESCE(dob, ''), COALESCE(consent, 'Pending'),
		       COALESCE(sessions_count, 0), COALESCE(last_assessment, '')
		FROM respondents ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]respondentPayload, 0)
	for rows.Next() {
		var p respondentPayload
		if err := rows.Scan(&p.ID, &p.Name, &p.Email, &p.DOB, &p.Consent, &p.SessionsCount, &p.LastAssessment); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *RespondentsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var p respondentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	p.Name = strings.TrimSpace(p.Name)
	p.Email = strings.TrimSpace(p.Email)
	p.ID = strings.TrimSpace(p.ID)
	if p.Name == "" || p.Email == "" || p.ID == "" {
		http.Error(w, "id, name, and email are required", http.StatusBadRequest)
		return
	}
	if p.Consent == "" {
		p.Consent = "Pending"
	}
	_, err := h.db.Exec(ctx, `
		INSERT INTO respondents (id, name, email, dob, consent, sessions_count, last_assessment)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, NULLIF($7, ''))
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, email = EXCLUDED.email, dob = EXCLUDED.dob,
		    consent = EXCLUDED.consent, sessions_count = EXCLUDED.sessions_count,
		    last_assessment = EXCLUDED.last_assessment`,
		p.ID, p.Name, p.Email, p.DOB, p.Consent, p.SessionsCount, p.LastAssessment)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *RespondentsHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p respondentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	tag, err := h.db.Exec(ctx, `
		UPDATE respondents
		SET name = COALESCE(NULLIF($2, ''), name),
		    email = COALESCE(NULLIF($3, ''), email),
		    dob = NULLIF($4, ''),
		    consent = COALESCE(NULLIF($5, ''), consent),
		    sessions_count = $6,
		    last_assessment = NULLIF($7, '')
		WHERE id = $1`,
		id, p.Name, p.Email, p.DOB, p.Consent, p.SessionsCount, p.LastAssessment)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	p.ID = id
	writeJSON(w, http.StatusOK, p)
}

func (h *RespondentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM respondents WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RespondentsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p respondentPayload
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email, COALESCE(dob, ''), COALESCE(consent, 'Pending'),
		       COALESCE(sessions_count, 0), COALESCE(last_assessment, '')
		FROM respondents WHERE id = $1`, id)
	if err := row.Scan(&p.ID, &p.Name, &p.Email, &p.DOB, &p.Consent, &p.SessionsCount, &p.LastAssessment); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Login with id + dob (used by the respondent portal). On success issues an
// opaque session token stored in portal_auth_sessions (7-day expiry).
type loginRequest struct {
	ID  string `json:"id"`
	DOB string `json:"dob"`
}

type loginResponse struct {
	Token      string             `json:"token"`
	Respondent respondentPayload  `json:"respondent"`
}

func (h *RespondentsHandler) Login(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.ID == "" || req.DOB == "" {
		http.Error(w, "id and dob required", http.StatusBadRequest)
		return
	}
	var p respondentPayload
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email FROM respondents
		WHERE LOWER(id) = LOWER($1) AND dob = $2`,
		req.ID, req.DOB)
	if err := row.Scan(&p.ID, &p.Name, &p.Email); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var token string
	if err := h.db.QueryRow(ctx, `
		INSERT INTO portal_auth_sessions (respondent_id)
		VALUES ($1) RETURNING token::text`, p.ID,
	).Scan(&token); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, loginResponse{Token: token, Respondent: p})
}

// Me resolves a token → respondent. Frontend calls this on every portal page
// mount so the client never caches respondent data, just the opaque token.
func (h *RespondentsHandler) Me(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}
	var p respondentPayload
	row := h.db.QueryRow(ctx, `
		SELECT r.id, r.name, r.email
		FROM portal_auth_sessions s
		JOIN respondents r ON r.id = s.respondent_id
		WHERE s.token::text = $1 AND s.expires_at > NOW()`, token)
	if err := row.Scan(&p.ID, &p.Name, &p.Email); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "session expired or invalid", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Logout invalidates the session token.
func (h *RespondentsHandler) Logout(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token != "" {
		_, _ = h.db.Exec(ctx, `DELETE FROM portal_auth_sessions WHERE token::text = $1`, token)
	}
	w.WriteHeader(http.StatusNoContent)
}
