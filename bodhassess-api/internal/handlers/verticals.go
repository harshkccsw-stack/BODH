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

type VerticalsHandler struct {
	db *pgxpool.Pool
}

func NewVerticalsHandler(db *pgxpool.Pool) *VerticalsHandler {
	return &VerticalsHandler{db: db}
}

type verticalPayload struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

func (h *VerticalsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, code, name, COALESCE(description, '')
		FROM verticals
		ORDER BY name`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]verticalPayload, 0)
	for rows.Next() {
		var v verticalPayload
		if err := rows.Scan(&v.ID, &v.Code, &v.Name, &v.Description); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *VerticalsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload verticalPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	payload.Code = strings.ToUpper(strings.TrimSpace(payload.Code))
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Code == "" || payload.Name == "" || payload.ID == "" {
		http.Error(w, "id, code, and name are required", http.StatusBadRequest)
		return
	}

	_, err := h.db.Exec(ctx, `
		INSERT INTO verticals (id, code, name, description)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE
			SET code = EXCLUDED.code,
			    name = EXCLUDED.name,
			    description = EXCLUDED.description`,
		payload.ID, payload.Code, payload.Name, payload.Description)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, payload)
}

func (h *VerticalsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	var v verticalPayload
	row := h.db.QueryRow(ctx, `SELECT id, code, name, COALESCE(description, '') FROM verticals WHERE id = $1`, id)
	if err := row.Scan(&v.ID, &v.Code, &v.Name, &v.Description); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *VerticalsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM verticals WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
