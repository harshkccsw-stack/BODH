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

type RolesHandler struct {
	db *pgxpool.Pool
}

func NewRolesHandler(db *pgxpool.Pool) *RolesHandler {
	return &RolesHandler{db: db}
}

type rolePayload struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	URLPaths    []string `json:"url_paths"`
}

func (h *RolesHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, COALESCE(description, ''), url_paths
		FROM roles ORDER BY name ASC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]rolePayload, 0)
	for rows.Next() {
		var p rolePayload
		var ujson []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &ujson); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(ujson) > 0 {
			_ = json.Unmarshal(ujson, &p.URLPaths)
		}
		if p.URLPaths == nil {
			p.URLPaths = []string{}
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *RolesHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p rolePayload
	var ujson []byte
	row := h.db.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), url_paths
		FROM roles WHERE id = $1`, id)
	if err := row.Scan(&p.ID, &p.Name, &p.Description, &ujson); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(ujson) > 0 {
		_ = json.Unmarshal(ujson, &p.URLPaths)
	}
	if p.URLPaths == nil {
		p.URLPaths = []string{}
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *RolesHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var p rolePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	p.ID = strings.TrimSpace(p.ID)
	p.Name = strings.TrimSpace(p.Name)
	if p.ID == "" || p.Name == "" {
		http.Error(w, "id and name are required", http.StatusBadRequest)
		return
	}
	if p.URLPaths == nil {
		p.URLPaths = []string{}
	}
	ujson, _ := json.Marshal(p.URLPaths)
	_, err := h.db.Exec(ctx, `
		INSERT INTO roles (id, name, description, url_paths)
		VALUES ($1, $2, NULLIF($3, ''), $4)
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, description = EXCLUDED.description, url_paths = EXCLUDED.url_paths`,
		p.ID, p.Name, p.Description, ujson)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *RolesHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p rolePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if p.URLPaths == nil {
		p.URLPaths = []string{}
	}
	ujson, _ := json.Marshal(p.URLPaths)
	tag, err := h.db.Exec(ctx, `
		UPDATE roles
		SET name        = COALESCE(NULLIF($2, ''), name),
		    description = NULLIF($3, ''),
		    url_paths   = $4
		WHERE id = $1`,
		id, p.Name, p.Description, ujson)
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

func (h *RolesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM roles WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
