package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ItemDisplayHandler struct {
	db *pgxpool.Pool
}

func NewItemDisplayHandler(db *pgxpool.Pool) *ItemDisplayHandler {
	return &ItemDisplayHandler{db: db}
}

type itemDisplayRow struct {
	ItemID   string                 `json:"itemId"`
	Override map[string]interface{} `json:"override,omitempty"`
	Deleted  bool                   `json:"deleted"`
}

// List returns every row — frontend caller reshapes into an overrides map +
// a deleted-ids set in one pass.
func (h *ItemDisplayHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `SELECT item_id, override, deleted FROM item_display_state`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]itemDisplayRow, 0)
	for rows.Next() {
		var row itemDisplayRow
		var overrideJSON []byte
		if err := rows.Scan(&row.ItemID, &overrideJSON, &row.Deleted); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(overrideJSON) > 0 {
			_ = json.Unmarshal(overrideJSON, &row.Override)
		}
		out = append(out, row)
	}
	writeJSON(w, http.StatusOK, out)
}

type upsertOverrideReq struct {
	ItemID   string                 `json:"itemId"`
	Override map[string]interface{} `json:"override"`
}

// Upsert stores/replaces the override for a single item id. Pass override=null
// to clear it while preserving the deleted flag (if any).
func (h *ItemDisplayHandler) UpsertOverride(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var req upsertOverrideReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.ItemID) == "" {
		http.Error(w, "itemId required", http.StatusBadRequest)
		return
	}
	var overrideJSON []byte
	if req.Override != nil {
		overrideJSON, _ = json.Marshal(req.Override)
	}
	_, err := h.db.Exec(ctx, `
		INSERT INTO item_display_state (item_id, override, deleted)
		VALUES ($1, $2, FALSE)
		ON CONFLICT (item_id) DO UPDATE
		SET override = EXCLUDED.override`,
		req.ItemID, overrideJSON)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, req)
}

// MarkDeleted sets deleted=true for the item id (soft delete). Frontend uses
// this to hide seed/mock rows.
func (h *ItemDisplayHandler) MarkDeleted(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if id == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	_, err := h.db.Exec(ctx, `
		INSERT INTO item_display_state (item_id, deleted)
		VALUES ($1, TRUE)
		ON CONFLICT (item_id) DO UPDATE SET deleted = TRUE`, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Clear removes any override + deleted flag for the item id.
func (h *ItemDisplayHandler) Clear(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM item_display_state WHERE item_id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
