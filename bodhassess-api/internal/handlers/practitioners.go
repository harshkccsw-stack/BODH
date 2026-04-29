package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PractitionersHandler struct {
	db *pgxpool.Pool
}

func NewPractitionersHandler(db *pgxpool.Pool) *PractitionersHandler {
	return &PractitionersHandler{db: db}
}

type practitionerPayload struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	Roles     []string `json:"roles"`
	Verticals []string `json:"verticals"`
	Status    string   `json:"status"`
	LastLogin string   `json:"last_login,omitempty"`
	DOB       string   `json:"dob,omitempty"`
}

func (h *PractitionersHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, email, roles, verticals, status, COALESCE(last_login, ''), COALESCE(TO_CHAR(dob, 'YYYY-MM-DD'), '')
		FROM practitioners ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]practitionerPayload, 0)
	for rows.Next() {
		var p practitionerPayload
		var rjson, vjson []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.Email, &rjson, &vjson, &p.Status, &p.LastLogin, &p.DOB); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(rjson) > 0 {
			_ = json.Unmarshal(rjson, &p.Roles)
		}
		if p.Roles == nil {
			p.Roles = []string{}
		}
		if len(vjson) > 0 {
			_ = json.Unmarshal(vjson, &p.Verticals)
		}
		if p.Verticals == nil {
			p.Verticals = []string{}
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *PractitionersHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var p practitionerPayload
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
	if p.Roles == nil {
		p.Roles = []string{}
	}
	if len(p.Roles) == 0 {
		p.Roles = []string{"Practitioner"}
	}
	if p.Status == "" {
		p.Status = "Active"
	}
	if p.Verticals == nil {
		p.Verticals = []string{}
	}
	rjson, _ := json.Marshal(p.Roles)
	vjson, _ := json.Marshal(p.Verticals)
	_, err := h.db.Exec(ctx, `
		INSERT INTO practitioners (id, name, email, roles, verticals, status, last_login, dob)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, '')::date)
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, email = EXCLUDED.email, roles = EXCLUDED.roles,
		    verticals = EXCLUDED.verticals, status = EXCLUDED.status,
		    last_login = EXCLUDED.last_login, dob = EXCLUDED.dob`,
		p.ID, p.Name, p.Email, rjson, vjson, p.Status, p.LastLogin, p.DOB)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *PractitionersHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p practitionerPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if p.Verticals == nil {
		p.Verticals = []string{}
	}
	if p.Roles == nil {
		p.Roles = []string{}
	}
	rjson, _ := json.Marshal(p.Roles)
	vjson, _ := json.Marshal(p.Verticals)
	tag, err := h.db.Exec(ctx, `
		UPDATE practitioners
		SET name = COALESCE(NULLIF($2, ''), name),
		    email = COALESCE(NULLIF($3, ''), email),
		    roles = $4,
		    verticals = $5,
		    status = COALESCE(NULLIF($6, ''), status),
		    last_login = NULLIF($7, ''),
		    dob = COALESCE(NULLIF($8, '')::date, dob)
		WHERE id = $1`,
		id, p.Name, p.Email, rjson, vjson, p.Status, p.LastLogin, p.DOB)
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

func (h *PractitionersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM practitioners WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Login (id + DOB) ---------------------------------------------------
//
// Practitioners sign into the dashboard with their practitioner ID (e.g.
// P-007) and date of birth. On success the server issues an opaque session
// token (stored in practitioner_auth_sessions, 7-day expiry). The /me
// endpoint exchanges the token for the practitioner record plus the merged
// set of allowed URL patterns from every role they hold — the frontend uses
// that list to gate pages and trim the sidebar.

type practitionerLoginRequest struct {
	ID  string `json:"id"`
	DOB string `json:"dob"`
}

type practitionerMePayload struct {
	practitionerPayload
	URLPaths []string `json:"url_paths"`
}

type practitionerLoginResponse struct {
	Token        string                `json:"token"`
	Practitioner practitionerMePayload `json:"practitioner"`
}

func (h *PractitionersHandler) Login(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var req practitionerLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	id := strings.TrimSpace(req.ID)
	dob := strings.TrimSpace(req.DOB)
	if id == "" || dob == "" {
		http.Error(w, "id and dob required", http.StatusBadRequest)
		return
	}
	var p practitionerPayload
	var rjson, vjson []byte
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email, roles, verticals, status, COALESCE(last_login, ''), COALESCE(TO_CHAR(dob, 'YYYY-MM-DD'), '')
		FROM practitioners
		WHERE LOWER(id) = LOWER($1) AND dob = $2::date`,
		id, dob)
	if err := row.Scan(&p.ID, &p.Name, &p.Email, &rjson, &vjson, &p.Status, &p.LastLogin, &p.DOB); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if p.Status == "Pending" {
		http.Error(w, "Your account is awaiting admin approval.", http.StatusForbidden)
		return
	}
	if p.Status != "Active" {
		http.Error(w, "Your account is inactive. Contact your administrator.", http.StatusForbidden)
		return
	}
	if len(rjson) > 0 {
		_ = json.Unmarshal(rjson, &p.Roles)
	}
	if p.Roles == nil {
		p.Roles = []string{}
	}
	if len(vjson) > 0 {
		_ = json.Unmarshal(vjson, &p.Verticals)
	}
	if p.Verticals == nil {
		p.Verticals = []string{}
	}

	urlPaths, err := h.urlPathsForRoles(ctx, p.Roles)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var token string
	if err := h.db.QueryRow(ctx, `
		INSERT INTO practitioner_auth_sessions (practitioner_id)
		VALUES ($1) RETURNING token::text`, p.ID,
	).Scan(&token); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Best-effort touch of last_login. Failure here doesn't block login.
	_, _ = h.db.Exec(ctx, `UPDATE practitioners SET last_login = TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') WHERE id = $1`, p.ID)

	writeJSON(w, http.StatusOK, practitionerLoginResponse{
		Token:        token,
		Practitioner: practitionerMePayload{practitionerPayload: p, URLPaths: urlPaths},
	})
}

// --- Signup (self-service, pending admin approval) ----------------------
//
// Public endpoint: a prospective practitioner submits name, email, and DOB.
// We mint the next sequential P-XXX id, insert the row with status='Pending'
// and empty roles/verticals, and return the new PID. The user can then log
// in with PID + DOB once an admin flips status to 'Active' and assigns
// roles/verticals on the Pending Requests admin page.

type practitionerSignupRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	DOB   string `json:"dob"`
}

type practitionerSignupResponse struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	DOB    string `json:"dob"`
	Status string `json:"status"`
}

func (h *PractitionersHandler) Signup(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var req practitionerSignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	dob := strings.TrimSpace(req.DOB)
	if name == "" || email == "" || dob == "" {
		http.Error(w, "name, email, and dob are required", http.StatusBadRequest)
		return
	}

	var existing string
	err := h.db.QueryRow(ctx, `SELECT id FROM practitioners WHERE LOWER(email) = LOWER($1)`, email).Scan(&existing)
	if err == nil {
		http.Error(w, "An account with this email already exists.", http.StatusConflict)
		return
	} else if err != pgx.ErrNoRows {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var maxNum int
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(id, '^P-', ''), '')::int), 0)
		FROM practitioners WHERE id ~ '^P-[0-9]+$'`).Scan(&maxNum)
	nextID := fmt.Sprintf("P-%03d", maxNum+1)

	rjson, _ := json.Marshal([]string{})
	vjson, _ := json.Marshal([]string{})

	if _, err := h.db.Exec(ctx, `
		INSERT INTO practitioners (id, name, email, roles, verticals, status, dob)
		VALUES ($1, $2, $3, $4, $5, 'Pending', NULLIF($6, '')::date)`,
		nextID, name, email, rjson, vjson, dob); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, practitionerSignupResponse{
		ID: nextID, Name: name, Email: email, DOB: dob, Status: "Pending",
	})
}

// Me resolves a token → practitioner with their merged URL pattern list.
func (h *PractitionersHandler) Me(w http.ResponseWriter, r *http.Request) {
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
	var p practitionerPayload
	var rjson, vjson []byte
	row := h.db.QueryRow(ctx, `
		SELECT pr.id, pr.name, pr.email, pr.roles, pr.verticals, pr.status,
		       COALESCE(pr.last_login, ''), COALESCE(TO_CHAR(pr.dob, 'YYYY-MM-DD'), '')
		FROM practitioner_auth_sessions s
		JOIN practitioners pr ON pr.id = s.practitioner_id
		WHERE s.token::text = $1 AND s.expires_at > NOW()`, token)
	if err := row.Scan(&p.ID, &p.Name, &p.Email, &rjson, &vjson, &p.Status, &p.LastLogin, &p.DOB); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "session expired or invalid", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rjson) > 0 {
		_ = json.Unmarshal(rjson, &p.Roles)
	}
	if p.Roles == nil {
		p.Roles = []string{}
	}
	if len(vjson) > 0 {
		_ = json.Unmarshal(vjson, &p.Verticals)
	}
	if p.Verticals == nil {
		p.Verticals = []string{}
	}
	urlPaths, err := h.urlPathsForRoles(ctx, p.Roles)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, practitionerMePayload{practitionerPayload: p, URLPaths: urlPaths})
}

func (h *PractitionersHandler) Logout(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token != "" {
		_, _ = h.db.Exec(ctx, `DELETE FROM practitioner_auth_sessions WHERE token::text = $1`, token)
	}
	w.WriteHeader(http.StatusNoContent)
}

// urlPathsForRoles returns the union of url_paths across every role the
// practitioner holds. Roles are matched by name (the practitioners.roles
// column stores role names, e.g. "Practitioner"). De-duplicates while
// preserving first-seen order.
func (h *PractitionersHandler) urlPathsForRoles(ctx context.Context, roleNames []string) ([]string, error) {
	if len(roleNames) == 0 {
		return []string{}, nil
	}
	rows, err := h.db.Query(ctx, `SELECT url_paths FROM roles WHERE name = ANY($1)`, roleNames)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := make(map[string]struct{})
	out := make([]string, 0)
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var paths []string
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &paths)
		}
		for _, p := range paths {
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = struct{}{}
			out = append(out, p)
		}
	}
	return out, nil
}

func (h *PractitionersHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p practitionerPayload
	var rjson, vjson []byte
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email, roles, verticals, status, COALESCE(last_login, ''), COALESCE(TO_CHAR(dob, 'YYYY-MM-DD'), '')
		FROM practitioners WHERE id = $1`, id)
	if err := row.Scan(&p.ID, &p.Name, &p.Email, &rjson, &vjson, &p.Status, &p.LastLogin, &p.DOB); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rjson) > 0 {
		_ = json.Unmarshal(rjson, &p.Roles)
	}
	if p.Roles == nil {
		p.Roles = []string{}
	}
	if len(vjson) > 0 {
		_ = json.Unmarshal(vjson, &p.Verticals)
	}
	if p.Verticals == nil {
		p.Verticals = []string{}
	}
	writeJSON(w, http.StatusOK, p)
}
