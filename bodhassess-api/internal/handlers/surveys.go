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

const (
	defaultSurveyTenantID  = "00000000-0000-0000-0000-000000000001"
	defaultSurveyCreatedBy = "00000000-0000-0000-0000-000000000010"
)

type SurveysHandler struct {
	db *pgxpool.Pool
}

func NewSurveysHandler(db *pgxpool.Pool) *SurveysHandler {
	return &SurveysHandler{db: db}
}

// --- List ---

func (h *SurveysHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	status := r.URL.Query().Get("status")

	query := `SELECT id, title, description, status, response_count, languages, delivery_methods, created_at
		FROM surveys WHERE 1=1`
	args := []interface{}{}
	if status != "" {
		query += " AND status = $1"
		args = append(args, status)
	}
	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to query surveys"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type SurveyRow struct {
		ID              string   `json:"id"`
		Title           string   `json:"title"`
		Description     *string  `json:"description"`
		Status          string   `json:"status"`
		ResponseCount   int      `json:"response_count"`
		Languages       []string `json:"languages"`
		DeliveryMethods []string `json:"delivery_methods"`
		CreatedAt       string   `json:"created_at"`
	}

	surveys := []SurveyRow{}
	for rows.Next() {
		var s SurveyRow
		var createdAt time.Time
		err := rows.Scan(&s.ID, &s.Title, &s.Description, &s.Status, &s.ResponseCount, &s.Languages, &s.DeliveryMethods, &createdAt)
		if err != nil {
			continue
		}
		s.CreatedAt = createdAt.Format(time.RFC3339)
		surveys = append(surveys, s)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  surveys,
		"total": len(surveys),
	})
}

// --- Create ---

type CreateSurveyRequest struct {
	TenantID        string        `json:"tenant_id"`
	CreatedBy       string        `json:"created_by"`
	Title           string        `json:"title"`
	Description     string        `json:"description"`
	Questions       []interface{} `json:"questions"`
	Languages       []string      `json:"languages"`
	DeliveryMethods []string      `json:"delivery_methods"`
}

func (h *SurveysHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req CreateSurveyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Title == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	if req.TenantID == "" {
		req.TenantID = defaultSurveyTenantID
	}
	if req.CreatedBy == "" {
		req.CreatedBy = defaultSurveyCreatedBy
	}
	if req.Languages == nil {
		req.Languages = []string{"en"}
	}
	if req.DeliveryMethods == nil {
		req.DeliveryMethods = []string{"email"}
	}
	if req.Questions == nil {
		req.Questions = []interface{}{}
	}

	questionsJSON, _ := json.Marshal(req.Questions)

	id := uuid.New()
	_, err := h.db.Exec(ctx,
		`INSERT INTO surveys (id, tenant_id, created_by, title, description, questions, languages, delivery_methods, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')`,
		id, req.TenantID, req.CreatedBy, req.Title, req.Description, questionsJSON, req.Languages, req.DeliveryMethods,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to create survey: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":     id,
		"title":  req.Title,
		"status": "DRAFT",
	})
}

// --- GetByID ---

func (h *SurveysHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	var (
		title, status                        string
		description                          *string
		responseCount                        int
		languages, deliveryMethods           []string
		questions                            []byte
		createdAt, updatedAt                 time.Time
		tenantID, createdBy                  string
	)

	err := h.db.QueryRow(ctx,
		`SELECT tenant_id, created_by, title, description, questions, languages, delivery_methods, status, response_count, created_at, updated_at
		FROM surveys WHERE id = $1`, id,
	).Scan(&tenantID, &createdBy, &title, &description, &questions, &languages, &deliveryMethods, &status, &responseCount, &createdAt, &updatedAt)

	if err != nil {
		http.Error(w, `{"error":"survey not found"}`, http.StatusNotFound)
		return
	}

	var parsedQuestions interface{}
	if questions != nil {
		json.Unmarshal(questions, &parsedQuestions)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":               id,
		"tenant_id":        tenantID,
		"created_by":       createdBy,
		"title":            title,
		"description":      description,
		"questions":        parsedQuestions,
		"languages":        languages,
		"delivery_methods": deliveryMethods,
		"status":           status,
		"response_count":   responseCount,
		"created_at":       createdAt.Format(time.RFC3339),
		"updated_at":       updatedAt.Format(time.RFC3339),
	})
}

// --- Publish (UpdateStatus) ---

func (h *SurveysHandler) Publish(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")

	tag, err := h.db.Exec(ctx,
		`UPDATE surveys SET status='PUBLISHED', updated_at=NOW() WHERE id = $1`, id,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to publish survey: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, `{"error":"survey not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":     id,
		"status": "PUBLISHED",
	})
}

// --- SubmitResponse ---

type SubmitResponseRequest struct {
	RespondentIdentifier string        `json:"respondent_identifier"`
	Answers              []interface{} `json:"answers"`
}

func (h *SurveysHandler) SubmitResponse(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	surveyID := chi.URLParam(r, "id")

	var req SubmitResponseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Answers == nil {
		req.Answers = []interface{}{}
	}
	answersJSON, _ := json.Marshal(req.Answers)

	id := uuid.New()
	var submittedAt time.Time
	err := h.db.QueryRow(ctx,
		`INSERT INTO survey_responses (id, survey_id, respondent_identifier, answers, user_agent)
		VALUES ($1, $2, $3, $4, $5) RETURNING submitted_at`,
		id, surveyID, req.RespondentIdentifier, answersJSON, r.UserAgent(),
	).Scan(&submittedAt)
	if err != nil {
		http.Error(w, `{"error":"failed to submit response: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	_, _ = h.db.Exec(ctx, `UPDATE surveys SET response_count = response_count + 1, updated_at = NOW() WHERE id = $1`, surveyID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":           id,
		"submitted_at": submittedAt.Format(time.RFC3339),
	})
}

// --- ListResponses ---

func (h *SurveysHandler) ListResponses(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	surveyID := chi.URLParam(r, "id")

	rows, err := h.db.Query(ctx,
		`SELECT id, respondent_identifier, answers, submitted_at
		FROM survey_responses WHERE survey_id = $1 ORDER BY submitted_at DESC LIMIT 200`, surveyID)
	if err != nil {
		http.Error(w, `{"error":"failed to query responses"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ResponseRow struct {
		ID                   string      `json:"id"`
		RespondentIdentifier *string     `json:"respondent_identifier"`
		Answers              interface{} `json:"answers"`
		SubmittedAt          string      `json:"submitted_at"`
	}

	responses := []ResponseRow{}
	for rows.Next() {
		var row ResponseRow
		var answers []byte
		var submittedAt time.Time
		err := rows.Scan(&row.ID, &row.RespondentIdentifier, &answers, &submittedAt)
		if err != nil {
			continue
		}
		row.SubmittedAt = submittedAt.Format(time.RFC3339)
		if answers != nil {
			json.Unmarshal(answers, &row.Answers)
		}
		responses = append(responses, row)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  responses,
		"total": len(responses),
	})
}
