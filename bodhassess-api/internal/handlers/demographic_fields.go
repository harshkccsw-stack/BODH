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

type DemographicFieldsHandler struct {
	db *pgxpool.Pool
}

func NewDemographicFieldsHandler(db *pgxpool.Pool) *DemographicFieldsHandler {
	return &DemographicFieldsHandler{db: db}
}

type demographicField struct {
	ID          string   `json:"id"`
	FieldKey    string   `json:"fieldKey"`
	Label       string   `json:"label"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Placeholder string   `json:"placeholder,omitempty"`
	Options     []string `json:"options"`
	SortOrder   int      `json:"sortOrder"`
	Active      bool     `json:"active"`
}

const demoFieldSelect = `
	SELECT id, field_key, label, type, required, COALESCE(placeholder, ''),
	       options, sort_order, active
	FROM demographic_fields`

func scanDemographicField(row pgx.Row) (demographicField, error) {
	var f demographicField
	var optsJSON []byte
	err := row.Scan(&f.ID, &f.FieldKey, &f.Label, &f.Type, &f.Required, &f.Placeholder,
		&optsJSON, &f.SortOrder, &f.Active)
	if err != nil {
		return f, err
	}
	if len(optsJSON) > 0 {
		_ = json.Unmarshal(optsJSON, &f.Options)
	}
	if f.Options == nil {
		f.Options = []string{}
	}
	return f, nil
}

func (h *DemographicFieldsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	where := ""
	if r.URL.Query().Get("active") == "true" {
		where = " WHERE active = TRUE"
	}
	rows, err := h.db.Query(ctx, demoFieldSelect+where+" ORDER BY sort_order ASC, label ASC")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]demographicField, 0)
	for rows.Next() {
		f, err := scanDemographicField(rows)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, f)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *DemographicFieldsHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var f demographicField
	if err := json.NewDecoder(r.Body).Decode(&f); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	f.ID = strings.TrimSpace(f.ID)
	f.FieldKey = strings.TrimSpace(f.FieldKey)
	f.Label = strings.TrimSpace(f.Label)
	f.Type = strings.TrimSpace(strings.ToLower(f.Type))
	if f.ID == "" || f.FieldKey == "" || f.Label == "" {
		http.Error(w, "id, fieldKey, and label are required", http.StatusBadRequest)
		return
	}
	switch f.Type {
	case "text", "number", "date", "select", "textarea":
	default:
		http.Error(w, "type must be one of: text, number, date, select, textarea", http.StatusBadRequest)
		return
	}
	if f.Options == nil {
		f.Options = []string{}
	}
	optsJSON, _ := json.Marshal(f.Options)

	_, err := h.db.Exec(ctx, `
		INSERT INTO demographic_fields (id, field_key, label, type, required, placeholder, options, sort_order, active)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9)
		ON CONFLICT (id) DO UPDATE SET
			field_key   = EXCLUDED.field_key,
			label       = EXCLUDED.label,
			type        = EXCLUDED.type,
			required    = EXCLUDED.required,
			placeholder = EXCLUDED.placeholder,
			options     = EXCLUDED.options,
			sort_order  = EXCLUDED.sort_order,
			active      = EXCLUDED.active`,
		f.ID, f.FieldKey, f.Label, f.Type, f.Required, f.Placeholder,
		optsJSON, f.SortOrder, f.Active)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (h *DemographicFieldsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM demographic_fields WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
