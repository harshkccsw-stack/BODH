package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ItemsHandler struct {
	db *pgxpool.Pool
}

func NewItemsHandler(db *pgxpool.Pool) *ItemsHandler {
	return &ItemsHandler{db: db}
}

// --- Create Instrument ---

type CreateInstrumentRequest struct {
	Name            string   `json:"name"`
	ShortName       string   `json:"short_name"`
	Vertical        string   `json:"vertical"`
	Category        string   `json:"category"`
	Description     string   `json:"description"`
	DurationMinutes int      `json:"duration_minutes"`
	Languages       []string `json:"languages"`
	TierRequired    string   `json:"tier_required"`
	IsAdaptive      bool     `json:"is_adaptive"`
	IsFixedSequence bool     `json:"is_fixed_sequence"`
	TenantID        string   `json:"tenant_id"`
}

func (h *ItemsHandler) CreateInstrument(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req CreateInstrumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Vertical == "" {
		http.Error(w, `{"error":"name and vertical are required"}`, http.StatusBadRequest)
		return
	}

	id := uuid.New()
	if req.Languages == nil {
		req.Languages = []string{"en"}
	}
	if req.TierRequired == "" {
		req.TierRequired = "T1"
	}

	var tenantID *uuid.UUID
	if req.TenantID != "" {
		t, _ := uuid.Parse(req.TenantID)
		tenantID = &t
	}

	_, err := h.db.Exec(ctx,
		`INSERT INTO instruments (id, tenant_id, name, short_name, vertical, category, description, duration_minutes, languages, tier_required, is_adaptive, is_fixed_sequence, item_count, is_published)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, TRUE)`,
		id, tenantID, req.Name, req.ShortName, req.Vertical, req.Category, req.Description, req.DurationMinutes, req.Languages, req.TierRequired, req.IsAdaptive, req.IsFixedSequence,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create instrument: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":       id,
		"name":     req.Name,
		"vertical": req.Vertical,
		"message":  "Instrument created. Add questions to build your assessment.",
	})
}

// --- List Items for an Instrument ---

func (h *ItemsHandler) ListByInstrument(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	instrumentID := chi.URLParam(r, "instrumentId")

	rows, err := h.db.Query(ctx,
		`SELECT id, sub_domain, item_format, stem, options, irt_a, irt_b, irt_c, validation_status, clinical_risk_flag, sequence_order, created_at
		FROM items WHERE instrument_id = $1 ORDER BY sequence_order, created_at`, instrumentID)
	if err != nil {
		http.Error(w, `{"error":"failed to query items"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ItemRow struct {
		ID               string      `json:"id"`
		SubDomain        *string     `json:"sub_domain"`
		Format           string      `json:"format"`
		Stem             string      `json:"stem"`
		Options          interface{} `json:"options"`
		IRTa             *float64    `json:"irt_a"`
		IRTb             *float64    `json:"irt_b"`
		IRTc             *float64    `json:"irt_c"`
		ValidationStatus string      `json:"validation_status"`
		RiskFlag         bool        `json:"clinical_risk_flag"`
		Sequence         *int        `json:"sequence_order"`
		CreatedAt        string      `json:"created_at"`
	}

	items := []ItemRow{}
	for rows.Next() {
		var item ItemRow
		var createdAt time.Time
		var options []byte
		err := rows.Scan(&item.ID, &item.SubDomain, &item.Format, &item.Stem, &options, &item.IRTa, &item.IRTb, &item.IRTc, &item.ValidationStatus, &item.RiskFlag, &item.Sequence, &createdAt)
		if err != nil {
			continue
		}
		item.CreatedAt = createdAt.Format(time.RFC3339)
		if options != nil {
			json.Unmarshal(options, &item.Options)
		}
		items = append(items, item)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  items,
		"total": len(items),
	})
}

// --- Create Single Item ---

type CreateItemRequest struct {
	SubDomain        string      `json:"sub_domain"`
	Format           string      `json:"format"`
	Stem             string      `json:"stem"`
	Options          interface{} `json:"options"`
	IRTa             *float64    `json:"irt_a"`
	IRTb             *float64    `json:"irt_b"`
	IRTc             *float64    `json:"irt_c"`
	RiskFlag         bool        `json:"clinical_risk_flag"`
	RiskRule         string      `json:"risk_flag_rule"`
	SequenceOrder    *int        `json:"sequence_order"`
	Languages        []string    `json:"languages"`
}

func (h *ItemsHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	instrumentID := chi.URLParam(r, "instrumentId")

	// Get instrument vertical
	var vertical string
	err := h.db.QueryRow(ctx, `SELECT vertical FROM instruments WHERE id = $1`, instrumentID).Scan(&vertical)
	if err != nil {
		http.Error(w, `{"error":"instrument not found"}`, http.StatusNotFound)
		return
	}

	var req CreateItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Stem == "" {
		http.Error(w, `{"error":"stem (question text) is required"}`, http.StatusBadRequest)
		return
	}
	if req.Format == "" {
		req.Format = "MCQ"
	}
	if req.Languages == nil {
		req.Languages = []string{"en"}
	}

	id := uuid.New()
	optionsJSON, _ := json.Marshal(req.Options)

	_, err = h.db.Exec(ctx,
		`INSERT INTO items (id, instrument_id, vertical, sub_domain, item_format, stem, options, irt_a, irt_b, irt_c, clinical_risk_flag, risk_flag_rule, sequence_order, languages, validation_status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'DRAFT')`,
		id, instrumentID, vertical, req.SubDomain, req.Format, req.Stem, optionsJSON, req.IRTa, req.IRTb, req.IRTc, req.RiskFlag, req.RiskRule, req.SequenceOrder, req.Languages,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create item: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Update instrument item count
	h.db.Exec(ctx, `UPDATE instruments SET item_count = (SELECT COUNT(*) FROM items WHERE instrument_id = $1), updated_at = NOW() WHERE id = $1`, instrumentID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            id,
		"instrument_id": instrumentID,
		"stem":          req.Stem,
		"format":        req.Format,
		"message":       "Item added to instrument.",
	})
}

// --- Bulk Create Items ---

type BulkCreateItemsRequest struct {
	Items []CreateItemRequest `json:"items"`
}

func (h *ItemsHandler) BulkCreateItems(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	instrumentID := chi.URLParam(r, "instrumentId")

	var vertical string
	err := h.db.QueryRow(ctx, `SELECT vertical FROM instruments WHERE id = $1`, instrumentID).Scan(&vertical)
	if err != nil {
		http.Error(w, `{"error":"instrument not found"}`, http.StatusNotFound)
		return
	}

	var req BulkCreateItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	created := 0
	for i, item := range req.Items {
		if item.Stem == "" {
			continue
		}
		if item.Format == "" {
			item.Format = "MCQ"
		}
		if item.Languages == nil {
			item.Languages = []string{"en"}
		}

		id := uuid.New()
		optionsJSON, _ := json.Marshal(item.Options)
		seq := i + 1
		if item.SequenceOrder != nil {
			seq = *item.SequenceOrder
		}

		_, err := h.db.Exec(ctx,
			`INSERT INTO items (id, instrument_id, vertical, sub_domain, item_format, stem, options, irt_a, irt_b, irt_c, clinical_risk_flag, risk_flag_rule, sequence_order, languages, validation_status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'DRAFT')`,
			id, instrumentID, vertical, item.SubDomain, item.Format, item.Stem, optionsJSON, item.IRTa, item.IRTb, item.IRTc, item.RiskFlag, item.RiskRule, seq, item.Languages,
		)
		if err == nil {
			created++
		}
	}

	h.db.Exec(ctx, `UPDATE instruments SET item_count = (SELECT COUNT(*) FROM items WHERE instrument_id = $1), updated_at = NOW() WHERE id = $1`, instrumentID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"created":       created,
		"total":         len(req.Items),
		"instrument_id": instrumentID,
		"message":       "Items added to instrument.",
	})
}
