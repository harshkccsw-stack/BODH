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
	Role      string   `json:"role"`
	Verticals []string `json:"verticals"`
	Status    string   `json:"status"`
	LastLogin string   `json:"last_login,omitempty"`
}

func (h *PractitionersHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, email, role, verticals, status, COALESCE(last_login, '')
		FROM practitioners ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]practitionerPayload, 0)
	for rows.Next() {
		var p practitionerPayload
		var vjson []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.Email, &p.Role, &vjson, &p.Status, &p.LastLogin); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
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
	if p.Role == "" {
		p.Role = "Practitioner"
	}
	if p.Status == "" {
		p.Status = "Active"
	}
	if p.Verticals == nil {
		p.Verticals = []string{}
	}
	vjson, _ := json.Marshal(p.Verticals)
	_, err := h.db.Exec(ctx, `
		INSERT INTO practitioners (id, name, email, role, verticals, status, last_login)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''))
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role,
		    verticals = EXCLUDED.verticals, status = EXCLUDED.status,
		    last_login = EXCLUDED.last_login`,
		p.ID, p.Name, p.Email, p.Role, vjson, p.Status, p.LastLogin)
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
	vjson, _ := json.Marshal(p.Verticals)
	tag, err := h.db.Exec(ctx, `
		UPDATE practitioners
		SET name = COALESCE(NULLIF($2, ''), name),
		    email = COALESCE(NULLIF($3, ''), email),
		    role = COALESCE(NULLIF($4, ''), role),
		    verticals = $5,
		    status = COALESCE(NULLIF($6, ''), status),
		    last_login = NULLIF($7, '')
		WHERE id = $1`,
		id, p.Name, p.Email, p.Role, vjson, p.Status, p.LastLogin)
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

func (h *PractitionersHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p practitionerPayload
	var vjson []byte
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email, role, verticals, status, COALESCE(last_login, '')
		FROM practitioners WHERE id = $1`, id)
	if err := row.Scan(&p.ID, &p.Name, &p.Email, &p.Role, &vjson, &p.Status, &p.LastLogin); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(vjson) > 0 {
		_ = json.Unmarshal(vjson, &p.Verticals)
	}
	writeJSON(w, http.StatusOK, p)
}
