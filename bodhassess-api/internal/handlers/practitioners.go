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
