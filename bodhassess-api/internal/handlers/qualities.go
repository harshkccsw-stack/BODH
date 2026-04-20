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

type QualitiesHandler struct {
	db *pgxpool.Pool
}

func NewQualitiesHandler(db *pgxpool.Pool) *QualitiesHandler {
	return &QualitiesHandler{db: db}
}

type mqtPayload struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type qualityPayload struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	MQTs        []mqtPayload `json:"mqts"`
}

func (h *QualitiesHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, name, COALESCE(description, ''), mqts
		FROM measured_qualities
		ORDER BY name`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := make([]qualityPayload, 0)
	for rows.Next() {
		var q qualityPayload
		var mqtsJSON []byte
		if err := rows.Scan(&q.ID, &q.Name, &q.Description, &mqtsJSON); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(mqtsJSON) > 0 {
			_ = json.Unmarshal(mqtsJSON, &q.MQTs)
		}
		if q.MQTs == nil {
			q.MQTs = []mqtPayload{}
		}
		out = append(out, q)
	}

	writeJSON(w, http.StatusOK, out)
}

func (h *QualitiesHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var payload qualityPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(payload.Name) == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(payload.ID) == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}
	if payload.MQTs == nil {
		payload.MQTs = []mqtPayload{}
	}

	mqtsJSON, _ := json.Marshal(payload.MQTs)

	_, err := h.db.Exec(ctx, `
		INSERT INTO measured_qualities (id, name, description, mqts)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE
			SET name = EXCLUDED.name,
			    description = EXCLUDED.description,
			    mqts = EXCLUDED.mqts`,
		payload.ID, payload.Name, payload.Description, mqtsJSON)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, payload)
}

func (h *QualitiesHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	var payload qualityPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if payload.MQTs == nil {
		payload.MQTs = []mqtPayload{}
	}
	mqtsJSON, _ := json.Marshal(payload.MQTs)

	tag, err := h.db.Exec(ctx, `
		UPDATE measured_qualities
		SET name = $2, description = $3, mqts = $4
		WHERE id = $1`,
		id, payload.Name, payload.Description, mqtsJSON)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		// Upsert: not present yet — insert.
		if _, err := h.db.Exec(ctx, `
			INSERT INTO measured_qualities (id, name, description, mqts)
			VALUES ($1, $2, $3, $4)`,
			id, payload.Name, payload.Description, mqtsJSON); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	payload.ID = id
	writeJSON(w, http.StatusOK, payload)
}

func (h *QualitiesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	if _, err := h.db.Exec(ctx, `DELETE FROM measured_qualities WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *QualitiesHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	row := h.db.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), mqts
		FROM measured_qualities WHERE id = $1`, id)

	var q qualityPayload
	var mqtsJSON []byte
	if err := row.Scan(&q.ID, &q.Name, &q.Description, &mqtsJSON); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(mqtsJSON) > 0 {
		_ = json.Unmarshal(mqtsJSON, &q.MQTs)
	}
	writeJSON(w, http.StatusOK, q)
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
