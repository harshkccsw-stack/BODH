package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QuestionnairesCatalogHandler struct {
	db *pgxpool.Pool
}

func NewQuestionnairesCatalogHandler(db *pgxpool.Pool) *QuestionnairesCatalogHandler {
	return &QuestionnairesCatalogHandler{db: db}
}

func (h *QuestionnairesCatalogHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	vertical := r.URL.Query().Get("vertical")
	query := `SELECT id, name, short_name, vertical, category, item_count, duration_minutes, languages, tier_required, is_adaptive, is_fixed_sequence, norm_status, age_range, is_published, created_at FROM instruments WHERE is_published = TRUE`
	args := []interface{}{}

	if vertical != "" {
		query += " AND vertical = $1"
		args = append(args, vertical)
	}
	query += " ORDER BY vertical, name"

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to query instruments"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type InstrumentRow struct {
		ID              string   `json:"id"`
		Name            string   `json:"name"`
		ShortName       *string  `json:"short_name"`
		Vertical        string   `json:"vertical"`
		Category        *string  `json:"category"`
		ItemCount       int      `json:"item_count"`
		DurationMinutes *int     `json:"duration_minutes"`
		Languages       []string `json:"languages"`
		TierRequired    string   `json:"tier_required"`
		IsAdaptive      bool     `json:"is_adaptive"`
		IsFixedSequence bool     `json:"is_fixed_sequence"`
		NormStatus      string   `json:"norm_status"`
		AgeRange        *string  `json:"age_range"`
		IsPublished     bool     `json:"is_published"`
		CreatedAt       string   `json:"created_at"`
	}

	instruments := []InstrumentRow{}
	for rows.Next() {
		var i InstrumentRow
		var createdAt time.Time
		err := rows.Scan(&i.ID, &i.Name, &i.ShortName, &i.Vertical, &i.Category, &i.ItemCount, &i.DurationMinutes, &i.Languages, &i.TierRequired, &i.IsAdaptive, &i.IsFixedSequence, &i.NormStatus, &i.AgeRange, &i.IsPublished, &createdAt)
		if err != nil {
			continue
		}
		i.CreatedAt = createdAt.Format(time.RFC3339)
		instruments = append(instruments, i)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  instruments,
		"total": len(instruments),
	})
}

func (h *QuestionnairesCatalogHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	var name, vertical, tierRequired, normStatus string
	var shortName, category, ageRange *string
	var itemCount int
	var durationMinutes *int
	var languages []string
	var isAdaptive, isFixedSequence bool
	var createdAt time.Time

	err := h.db.QueryRow(ctx,
		`SELECT name, short_name, vertical, category, item_count, duration_minutes, languages, tier_required, is_adaptive, is_fixed_sequence, norm_status, age_range, created_at FROM instruments WHERE id = $1`,
		id,
	).Scan(&name, &shortName, &vertical, &category, &itemCount, &durationMinutes, &languages, &tierRequired, &isAdaptive, &isFixedSequence, &normStatus, &ageRange, &createdAt)

	if err != nil {
		http.Error(w, `{"error":"instrument not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":               id,
		"name":             name,
		"short_name":       shortName,
		"vertical":         vertical,
		"category":         category,
		"item_count":       itemCount,
		"duration_minutes": durationMinutes,
		"languages":        languages,
		"tier_required":    tierRequired,
		"is_adaptive":      isAdaptive,
		"is_fixed_sequence": isFixedSequence,
		"norm_status":      normStatus,
		"age_range":        ageRange,
		"created_at":       createdAt.Format(time.RFC3339),
	})
}
