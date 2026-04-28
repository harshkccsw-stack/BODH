package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RespondentsHandler struct {
	db *pgxpool.Pool
}

func NewRespondentsHandler(db *pgxpool.Pool) *RespondentsHandler {
	return &RespondentsHandler{db: db}
}

type respondentPayload struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Email          string `json:"email"`
	Phone          string `json:"phone,omitempty"`
	DOB            string `json:"dob,omitempty"`
	Consent        string `json:"consent,omitempty"`
	SessionsCount  int    `json:"sessions_count,omitempty"`
	LastAssessment string `json:"last_assessment,omitempty"`
	AccountType    string `json:"accountType,omitempty"`
	OrgName        string `json:"orgName,omitempty"`
	OrgWebsite     string `json:"orgWebsite,omitempty"`
}

func (h *RespondentsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, email, COALESCE(phone, ''), COALESCE(dob, ''), COALESCE(consent, 'Pending'),
		       COALESCE(sessions_count, 0), COALESCE(last_assessment, ''),
		       COALESCE(account_type, 'individual'), COALESCE(org_name, ''), COALESCE(org_website, '')
		FROM respondents ORDER BY created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]respondentPayload, 0)
	for rows.Next() {
		var p respondentPayload
		if err := rows.Scan(&p.ID, &p.Name, &p.Email, &p.Phone, &p.DOB, &p.Consent, &p.SessionsCount, &p.LastAssessment, &p.AccountType, &p.OrgName, &p.OrgWebsite); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *RespondentsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var p respondentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	p.Name = strings.TrimSpace(p.Name)
	p.Email = strings.TrimSpace(p.Email)
	p.ID = strings.TrimSpace(p.ID)
	if p.Name == "" || p.Email == "" || p.ID == "" {
		http.Error(w, "id, name, and email are required", http.StatusBadRequest)
		return
	}
	if p.Consent == "" {
		p.Consent = "Pending"
	}
	if p.AccountType == "" {
		p.AccountType = "individual"
	}
	_, err := h.db.Exec(ctx, `
		INSERT INTO respondents (id, name, email, phone, dob, consent, sessions_count, last_assessment, account_type, org_name, org_website)
		VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, NULLIF($8, ''), $9, NULLIF($10, ''), NULLIF($11, ''))
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, dob = EXCLUDED.dob,
		    consent = EXCLUDED.consent, sessions_count = EXCLUDED.sessions_count,
		    last_assessment = EXCLUDED.last_assessment, account_type = EXCLUDED.account_type,
		    org_name = EXCLUDED.org_name, org_website = EXCLUDED.org_website`,
		p.ID, p.Name, p.Email, p.Phone, p.DOB, p.Consent, p.SessionsCount, p.LastAssessment, p.AccountType, p.OrgName, p.OrgWebsite)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *RespondentsHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p respondentPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	tag, err := h.db.Exec(ctx, `
		UPDATE respondents
		SET name = COALESCE(NULLIF($2, ''), name),
		    email = COALESCE(NULLIF($3, ''), email),
		    phone = COALESCE(NULLIF($4, ''), phone),
		    dob = NULLIF($5, ''),
		    consent = COALESCE(NULLIF($6, ''), consent),
		    sessions_count = $7,
		    last_assessment = NULLIF($8, ''),
		    account_type = COALESCE(NULLIF($9, ''), account_type),
		    org_name = COALESCE(NULLIF($10, ''), org_name),
		    org_website = COALESCE(NULLIF($11, ''), org_website)
		WHERE id = $1`,
		id, p.Name, p.Email, p.Phone, p.DOB, p.Consent, p.SessionsCount, p.LastAssessment, p.AccountType, p.OrgName, p.OrgWebsite)
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

func (h *RespondentsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	if _, err := h.db.Exec(ctx, `DELETE FROM respondents WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RespondentsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p respondentPayload
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email, COALESCE(phone, ''), COALESCE(dob, ''), COALESCE(consent, 'Pending'),
		       COALESCE(sessions_count, 0), COALESCE(last_assessment, ''),
		       COALESCE(account_type, 'individual'), COALESCE(org_name, ''), COALESCE(org_website, '')
		FROM respondents WHERE id = $1`, id)
	if err := row.Scan(&p.ID, &p.Name, &p.Email, &p.Phone, &p.DOB, &p.Consent, &p.SessionsCount, &p.LastAssessment, &p.AccountType, &p.OrgName, &p.OrgWebsite); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Login with id + dob (used by the respondent portal). On success issues an
// opaque session token stored in portal_auth_sessions (7-day expiry).
type loginRequest struct {
	ID  string `json:"id"`
	DOB string `json:"dob"`
}

type loginResponse struct {
	Token      string             `json:"token"`
	Respondent respondentPayload  `json:"respondent"`
}

func (h *RespondentsHandler) Login(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.ID == "" || req.DOB == "" {
		http.Error(w, "id and dob required", http.StatusBadRequest)
		return
	}
	var p respondentPayload
	row := h.db.QueryRow(ctx, `
		SELECT id, name, email FROM respondents
		WHERE LOWER(id) = LOWER($1) AND dob = $2`,
		req.ID, req.DOB)
	if err := row.Scan(&p.ID, &p.Name, &p.Email); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var token string
	if err := h.db.QueryRow(ctx, `
		INSERT INTO portal_auth_sessions (respondent_id)
		VALUES ($1) RETURNING token::text`, p.ID,
	).Scan(&token); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, loginResponse{Token: token, Respondent: p})
}

// Me resolves a token → respondent. Frontend calls this on every portal page
// mount so the client never caches respondent data, just the opaque token.
func (h *RespondentsHandler) Me(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		http.Error(w, "token required", http.StatusUnauthorized)
		return
	}
	var p respondentPayload
	row := h.db.QueryRow(ctx, `
		SELECT r.id, r.name, r.email
		FROM portal_auth_sessions s
		JOIN respondents r ON r.id = s.respondent_id
		WHERE s.token::text = $1 AND s.expires_at > NOW()`, token)
	if err := row.Scan(&p.ID, &p.Name, &p.Email); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "session expired or invalid", http.StatusUnauthorized)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// Logout invalidates the session token.
func (h *RespondentsHandler) Logout(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token != "" {
		_, _ = h.db.Exec(ctx, `DELETE FROM portal_auth_sessions WHERE token::text = $1`, token)
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Bulk create (CSV / Excel upload) -------------------------------------
//
// Accepts a pre-parsed array of rows (the client parses the CSV / XLSX file
// and sends JSON). Every row is re-validated server-side; IDs are generated
// inside a single transaction under a Postgres advisory lock so concurrent
// bulk uploads cannot collide. Duplicate emails (both within the batch and
// against existing rows) are skipped with a structured error entry so the
// admin gets per-row feedback.

const maxBulkRespondents = 1000

type bulkRespondentRow struct {
	Name    string `json:"name"`
	Email   string `json:"email"`
	DOB     string `json:"dob"`
	Consent string `json:"consent"`
}

type bulkRespondentReq struct {
	Respondents []bulkRespondentRow `json:"respondents"`
}

type bulkRespondentError struct {
	Row    int    `json:"row"` // 1-indexed row number from the uploaded file
	Email  string `json:"email,omitempty"`
	Reason string `json:"reason"`
}

type bulkRespondentResp struct {
	Created  int                   `json:"created"`
	Skipped  int                   `json:"skipped"`
	Errors   []bulkRespondentError `json:"errors"`
	Inserted []respondentPayload   `json:"inserted"`
}

var (
	bulkEmailRegex = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	bulkDOBRegex   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func (h *RespondentsHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	// Bulk operations can take longer than the 5s cutoff used elsewhere;
	// cap the request body to 1 MB to prevent memory exhaustion from a
	// hostile payload.
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var req bulkRespondentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(req.Respondents) == 0 {
		http.Error(w, "respondents array is empty", http.StatusBadRequest)
		return
	}
	if len(req.Respondents) > maxBulkRespondents {
		http.Error(w, fmt.Sprintf("max %d respondents per upload", maxBulkRespondents), http.StatusBadRequest)
		return
	}

	resp := bulkRespondentResp{
		Errors:   []bulkRespondentError{},
		Inserted: []respondentPayload{},
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize R-NNN id generation across concurrent bulk uploads. The lock
	// is released automatically when the transaction commits or rolls back.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('respondents_id_gen')::bigint)`); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Within-batch duplicate detection (file has the same email twice).
	seenEmails := make(map[string]int, len(req.Respondents))

	for i, row := range req.Respondents {
		rowNum := i + 1
		name := strings.TrimSpace(row.Name)
		email := strings.ToLower(strings.TrimSpace(row.Email))
		dob := strings.TrimSpace(row.DOB)
		consent := strings.TrimSpace(row.Consent)

		if name == "" {
			resp.Errors = append(resp.Errors, bulkRespondentError{Row: rowNum, Reason: "name is required"})
			continue
		}
		if !bulkEmailRegex.MatchString(email) {
			resp.Errors = append(resp.Errors, bulkRespondentError{Row: rowNum, Email: email, Reason: "invalid email"})
			continue
		}
		if !bulkDOBRegex.MatchString(dob) {
			resp.Errors = append(resp.Errors, bulkRespondentError{Row: rowNum, Email: email, Reason: "dob must be YYYY-MM-DD"})
			continue
		}
		dobDate, derr := time.Parse("2006-01-02", dob)
		if derr != nil || dobDate.After(time.Now()) || dobDate.Year() < 1900 {
			resp.Errors = append(resp.Errors, bulkRespondentError{Row: rowNum, Email: email, Reason: "dob is not a valid date"})
			continue
		}
		if consent == "" {
			consent = "Pending"
		}
		if consent != "Granted" && consent != "Pending" && consent != "Withdrawn" {
			resp.Errors = append(resp.Errors, bulkRespondentError{Row: rowNum, Email: email, Reason: "consent must be Granted, Pending, or Withdrawn"})
			continue
		}
		if prevRow, ok := seenEmails[email]; ok {
			resp.Errors = append(resp.Errors, bulkRespondentError{
				Row:    rowNum,
				Email:  email,
				Reason: fmt.Sprintf("duplicate email in file (also row %d)", prevRow),
			})
			continue
		}
		seenEmails[email] = rowNum

		// Insert with server-generated R-NNN id. The CTE recomputes next id
		// from the current MAX on every row so insert-then-skip cycles don't
		// leak gaps — an id is only consumed when a row is actually inserted.
		//
		// ON CONFLICT DO NOTHING (no target) catches BOTH email UNIQUE and id
		// PK conflicts. The id conflict can happen in the rare race where a
		// concurrent single-create (POST /respondents) commits a new row
		// between our MAX() and our INSERT — single-create doesn't take the
		// advisory lock, so we can't exclude it. Without this, a PK conflict
		// would abort the whole transaction and poison the rest of the batch.
		var inserted respondentPayload
		scanErr := tx.QueryRow(ctx, `
			WITH next_id AS (
				SELECT 'R-' || LPAD((COALESCE(MAX((SUBSTRING(id FROM 3))::int), 0) + 1)::text, 3, '0') AS id
				FROM respondents
				WHERE id ~ '^R-\d+$'
			)
			INSERT INTO respondents (id, name, email, dob, consent, sessions_count)
			SELECT next_id.id, $1, $2, $3, $4, 0 FROM next_id
			ON CONFLICT DO NOTHING
			RETURNING id, name, email, COALESCE(dob, ''), COALESCE(consent, 'Pending'),
			          COALESCE(sessions_count, 0), COALESCE(last_assessment, '')`,
			name, email, dob, consent,
		).Scan(
			&inserted.ID, &inserted.Name, &inserted.Email,
			&inserted.DOB, &inserted.Consent,
			&inserted.SessionsCount, &inserted.LastAssessment,
		)
		if scanErr == pgx.ErrNoRows {
			// Email already exists in the DB from a previous upload / manual add.
			resp.Skipped++
			resp.Errors = append(resp.Errors, bulkRespondentError{
				Row: rowNum, Email: email, Reason: "email already exists",
			})
			continue
		}
		if scanErr != nil {
			resp.Errors = append(resp.Errors, bulkRespondentError{
				Row: rowNum, Email: email, Reason: scanErr.Error(),
			})
			continue
		}
		resp.Inserted = append(resp.Inserted, inserted)
		resp.Created++
	}

	if err := tx.Commit(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
