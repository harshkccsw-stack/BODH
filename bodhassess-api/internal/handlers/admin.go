package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultTenantID = "00000000-0000-0000-0000-000000000001"

type AdminHandler struct {
	db *pgxpool.Pool
}

func NewAdminHandler(db *pgxpool.Pool) *AdminHandler {
	return &AdminHandler{db: db}
}

// --- Helpers ---

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "23505") || strings.Contains(strings.ToLower(msg), "unique")
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// --- List Practitioners ---

func (h *AdminHandler) ListPractitioners(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, email, name, role, verticals, primary_language, is_active, last_login, created_at
		FROM users
		WHERE role IN ('PRACTITIONER','SENIOR_PRACTITIONER','TENANT_ADMIN','PLATFORM_ADMIN','BODHLENS_VIEWER')
		ORDER BY created_at DESC
		LIMIT 200
	`)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to query practitioners")
		return
	}
	defer rows.Close()

	type PractitionerRow struct {
		ID              string   `json:"id"`
		Email           string   `json:"email"`
		Name            string   `json:"name"`
		Role            string   `json:"role"`
		Verticals       []string `json:"verticals"`
		PrimaryLanguage string   `json:"primary_language"`
		IsActive        bool     `json:"is_active"`
		LastLogin       *string  `json:"last_login"`
		CreatedAt       string   `json:"created_at"`
	}

	practitioners := []PractitionerRow{}
	for rows.Next() {
		var p PractitionerRow
		var verticals []string
		var lastLogin *time.Time
		var createdAt time.Time
		err := rows.Scan(&p.ID, &p.Email, &p.Name, &p.Role, &verticals, &p.PrimaryLanguage, &p.IsActive, &lastLogin, &createdAt)
		if err != nil {
			continue
		}
		if verticals == nil {
			verticals = []string{}
		}
		p.Verticals = verticals
		p.CreatedAt = createdAt.Format(time.RFC3339)
		if lastLogin != nil {
			t := lastLogin.Format(time.RFC3339)
			p.LastLogin = &t
		}
		practitioners = append(practitioners, p)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  practitioners,
		"total": len(practitioners),
	})
}

// --- Create Practitioner ---

type CreatePractitionerRequest struct {
	TenantID        string   `json:"tenant_id"`
	Email           string   `json:"email"`
	Name            string   `json:"name"`
	Role            string   `json:"role"`
	Verticals       []string `json:"verticals"`
	PrimaryLanguage string   `json:"primary_language"`
}

func (h *AdminHandler) CreatePractitioner(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req CreatePractitionerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "email and name are required")
		return
	}

	if req.TenantID == "" {
		req.TenantID = defaultTenantID
	}
	if req.Role == "" {
		req.Role = "PRACTITIONER"
	}
	if req.PrimaryLanguage == "" {
		req.PrimaryLanguage = "en"
	}
	if req.Verticals == nil {
		req.Verticals = []string{}
	}

	id := uuid.New()
	_, err := h.db.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, name, role, verticals, primary_language, is_active)
		VALUES ($1, $2, $3, $4, $5::user_role, $6::vertical_type[], $7::language_code, TRUE)
	`, id, req.TenantID, req.Email, req.Name, req.Role, req.Verticals, req.PrimaryLanguage)

	if err != nil {
		if isUniqueViolation(err) {
			writeJSONError(w, http.StatusConflict, "user with this email already exists")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to create practitioner: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":    id,
		"email": req.Email,
		"name":  req.Name,
		"role":  req.Role,
	})
}

// --- List Respondents ---

func (h *AdminHandler) ListRespondents(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	rows, err := h.db.Query(ctx, `
		SELECT id, email, name, primary_language, date_of_birth, is_active, created_at
		FROM users
		WHERE role = 'RESPONDENT'
		ORDER BY created_at DESC
		LIMIT 200
	`)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to query respondents")
		return
	}
	defer rows.Close()

	type RespondentRow struct {
		ID              string  `json:"id"`
		Email           string  `json:"email"`
		Name            string  `json:"name"`
		PrimaryLanguage string  `json:"primary_language"`
		DateOfBirth     *string `json:"date_of_birth"`
		IsActive        bool    `json:"is_active"`
		CreatedAt       string  `json:"created_at"`
	}

	respondents := []RespondentRow{}
	for rows.Next() {
		var r RespondentRow
		var dob *time.Time
		var createdAt time.Time
		err := rows.Scan(&r.ID, &r.Email, &r.Name, &r.PrimaryLanguage, &dob, &r.IsActive, &createdAt)
		if err != nil {
			continue
		}
		r.CreatedAt = createdAt.Format(time.RFC3339)
		if dob != nil {
			s := dob.Format("2006-01-02")
			r.DateOfBirth = &s
		}
		respondents = append(respondents, r)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  respondents,
		"total": len(respondents),
	})
}

// --- Create Respondent ---

type CreateRespondentRequest struct {
	TenantID        string `json:"tenant_id"`
	Email           string `json:"email"`
	Name            string `json:"name"`
	PrimaryLanguage string `json:"primary_language"`
	DateOfBirth     string `json:"date_of_birth"`
}

func (h *AdminHandler) CreateRespondent(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req CreateRespondentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "email and name are required")
		return
	}

	if req.TenantID == "" {
		req.TenantID = defaultTenantID
	}
	if req.PrimaryLanguage == "" {
		req.PrimaryLanguage = "en"
	}

	var dob *time.Time
	if req.DateOfBirth != "" {
		t, err := time.Parse("2006-01-02", req.DateOfBirth)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "date_of_birth must be YYYY-MM-DD")
			return
		}
		dob = &t
	}

	id := uuid.New()
	_, err := h.db.Exec(ctx, `
		INSERT INTO users (id, tenant_id, email, name, role, primary_language, date_of_birth, is_active)
		VALUES ($1, $2, $3, $4, 'RESPONDENT', $5::language_code, $6, TRUE)
	`, id, req.TenantID, req.Email, req.Name, req.PrimaryLanguage, dob)

	if err != nil {
		if isUniqueViolation(err) {
			writeJSONError(w, http.StatusConflict, "user with this email already exists")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to create respondent: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":    id,
		"email": req.Email,
		"name":  req.Name,
	})
}

// --- Set Active ---

type SetActiveRequest struct {
	IsActive bool `json:"is_active"`
}

func (h *AdminHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	id := chi.URLParam(r, "id")
	if id == "" {
		writeJSONError(w, http.StatusBadRequest, "id is required")
		return
	}

	var req SetActiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	res, err := h.db.Exec(ctx, `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`, req.IsActive, id)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update user: "+err.Error())
		return
	}
	if res.RowsAffected() == 0 {
		writeJSONError(w, http.StatusNotFound, "user not found")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":        id,
		"is_active": req.IsActive,
	})
}
