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

type QuestionnairesHandler struct {
	db *pgxpool.Pool
}

func NewQuestionnairesHandler(db *pgxpool.Pool) *QuestionnairesHandler {
	return &QuestionnairesHandler{db: db}
}

type questionnairePayload struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	ShortName   string          `json:"shortName"`
	Vertical    string          `json:"vertical"`
	Category    string          `json:"category"`
	Description string          `json:"description"`
	Duration    int             `json:"duration"`
	Tier        string          `json:"tier"`
	Languages   []string        `json:"languages"`
	MQs         json.RawMessage `json:"mqs"`
	Questions   json.RawMessage `json:"questions"`
	IsDemo      bool            `json:"isDemo"`
	CreatedAt   string          `json:"createdAt,omitempty"`
}

const qnSelect = `
	SELECT id, name, COALESCE(short_name, ''), COALESCE(vertical, ''),
	       COALESCE(category, ''), COALESCE(description, ''),
	       COALESCE(duration, 0), COALESCE(tier, ''),
	       languages, mqs, questions, is_demo, created_at
	FROM published_questionnaires`

func scanQuestionnaire(row pgx.Row) (questionnairePayload, error) {
	var q questionnairePayload
	var langsJSON []byte
	var createdAt time.Time
	err := row.Scan(&q.ID, &q.Name, &q.ShortName, &q.Vertical, &q.Category, &q.Description,
		&q.Duration, &q.Tier, &langsJSON, &q.MQs, &q.Questions, &q.IsDemo, &createdAt)
	if err != nil {
		return q, err
	}
	if len(langsJSON) > 0 {
		_ = json.Unmarshal(langsJSON, &q.Languages)
	}
	if q.Languages == nil {
		q.Languages = []string{}
	}
	if len(q.MQs) == 0 {
		q.MQs = json.RawMessage("[]")
	}
	if len(q.Questions) == 0 {
		q.Questions = json.RawMessage("[]")
	}
	q.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	return q, nil
}

func (h *QuestionnairesHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	where := ""
	args := []interface{}{}
	if v := r.URL.Query().Get("vertical"); v != "" {
		where = " WHERE LOWER(vertical) = LOWER($1)"
		args = append(args, v)
	}
	rows, err := h.db.Query(ctx, qnSelect+where+" ORDER BY created_at DESC", args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]questionnairePayload, 0)
	for rows.Next() {
		q, err := scanQuestionnaire(rows)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, q)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *QuestionnairesHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	row := h.db.QueryRow(ctx, qnSelect+" WHERE id = $1", id)
	q, err := scanQuestionnaire(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, q)
}

// Look up by name — useful for the portal take flow which only has the
// questionnaire name from the session record.
func (h *QuestionnairesHandler) GetByName(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "name query param required", http.StatusBadRequest)
		return
	}
	row := h.db.QueryRow(ctx, qnSelect+" WHERE LOWER(name) = LOWER($1) OR LOWER(short_name) = LOWER($1) LIMIT 1", name)
	q, err := scanQuestionnaire(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, q)
}

// Upsert create — idempotent on both id and name so re-publishes overwrite cleanly.
func (h *QuestionnairesHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var q questionnairePayload
	if err := json.NewDecoder(r.Body).Decode(&q); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	q.ID = strings.TrimSpace(q.ID)
	q.Name = strings.TrimSpace(q.Name)
	if q.ID == "" || q.Name == "" {
		http.Error(w, "id and name are required", http.StatusBadRequest)
		return
	}
	if q.Languages == nil {
		q.Languages = []string{}
	}
	if len(q.MQs) == 0 {
		q.MQs = json.RawMessage("[]")
	}
	if len(q.Questions) == 0 {
		q.Questions = json.RawMessage("[]")
	}
	langsJSON, _ := json.Marshal(q.Languages)

	// First, ensure no other row holds this name (frontend re-publishes may
	// rename; dedup by name).
	if _, err := h.db.Exec(ctx,
		`DELETE FROM published_questionnaires WHERE LOWER(name) = LOWER($1) AND id <> $2`,
		q.Name, q.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err := h.db.Exec(ctx, `
		INSERT INTO published_questionnaires (
			id, name, short_name, vertical, category, description,
			duration, tier, languages, mqs, questions, is_demo
		) VALUES (
			$1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''),
			NULLIF($7, 0), NULLIF($8, ''), $9, $10, $11, $12
		)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			short_name = EXCLUDED.short_name,
			vertical = EXCLUDED.vertical,
			category = EXCLUDED.category,
			description = EXCLUDED.description,
			duration = EXCLUDED.duration,
			tier = EXCLUDED.tier,
			languages = EXCLUDED.languages,
			mqs = EXCLUDED.mqs,
			questions = EXCLUDED.questions,
			is_demo = EXCLUDED.is_demo`,
		q.ID, q.Name, q.ShortName, q.Vertical, q.Category, q.Description,
		q.Duration, q.Tier, langsJSON, []byte(q.MQs), []byte(q.Questions), q.IsDemo,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, q)
}

func (h *QuestionnairesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM published_questionnaires WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
