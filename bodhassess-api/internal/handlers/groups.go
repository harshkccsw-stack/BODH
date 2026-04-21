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

type GroupsHandler struct {
	db *pgxpool.Pool
}

func NewGroupsHandler(db *pgxpool.Pool) *GroupsHandler {
	return &GroupsHandler{db: db}
}

type groupPayload struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	Description         string   `json:"description,omitempty"`
	ParentID            *string  `json:"parentId"`
	MemberIDs           []string `json:"memberIds"`
	AssignedInstruments []string `json:"assignedInstruments"`
	CreatedAt           string   `json:"createdAt,omitempty"`
}

func (h *GroupsHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	rows, err := h.db.Query(ctx, `
		SELECT id, name, COALESCE(description, ''), parent_id,
		       member_ids, assigned_instruments, created_at
		FROM respondent_groups ORDER BY created_at ASC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	out := make([]groupPayload, 0)
	for rows.Next() {
		var p groupPayload
		var parent *string
		var mjson, ajson []byte
		var createdAt time.Time
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &parent, &mjson, &ajson, &createdAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		p.ParentID = parent
		if len(mjson) > 0 {
			_ = json.Unmarshal(mjson, &p.MemberIDs)
		}
		if p.MemberIDs == nil {
			p.MemberIDs = []string{}
		}
		if len(ajson) > 0 {
			_ = json.Unmarshal(ajson, &p.AssignedInstruments)
		}
		if p.AssignedInstruments == nil {
			p.AssignedInstruments = []string{}
		}
		p.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *GroupsHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var p groupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	p.Name = strings.TrimSpace(p.Name)
	p.ID = strings.TrimSpace(p.ID)
	if p.Name == "" || p.ID == "" {
		http.Error(w, "id and name are required", http.StatusBadRequest)
		return
	}
	if p.MemberIDs == nil {
		p.MemberIDs = []string{}
	}
	if p.AssignedInstruments == nil {
		p.AssignedInstruments = []string{}
	}
	mjson, _ := json.Marshal(p.MemberIDs)
	ajson, _ := json.Marshal(p.AssignedInstruments)

	_, err := h.db.Exec(ctx, `
		INSERT INTO respondent_groups (id, name, description, parent_id, member_ids, assigned_instruments)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name, description = EXCLUDED.description,
		    parent_id = EXCLUDED.parent_id, member_ids = EXCLUDED.member_ids,
		    assigned_instruments = EXCLUDED.assigned_instruments`,
		p.ID, p.Name, p.Description, p.ParentID, mjson, ajson)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *GroupsHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p groupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if p.MemberIDs == nil {
		p.MemberIDs = []string{}
	}
	if p.AssignedInstruments == nil {
		p.AssignedInstruments = []string{}
	}
	mjson, _ := json.Marshal(p.MemberIDs)
	ajson, _ := json.Marshal(p.AssignedInstruments)

	tag, err := h.db.Exec(ctx, `
		UPDATE respondent_groups
		SET name = COALESCE(NULLIF($2, ''), name),
		    description = $3,
		    parent_id = $4,
		    member_ids = $5,
		    assigned_instruments = $6
		WHERE id = $1`,
		id, p.Name, p.Description, p.ParentID, mjson, ajson)
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

func (h *GroupsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	// ON DELETE CASCADE handles children
	if _, err := h.db.Exec(ctx, `DELETE FROM respondent_groups WHERE id = $1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *GroupsHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	id := chi.URLParam(r, "id")
	var p groupPayload
	var parent *string
	var mjson, ajson []byte
	var createdAt time.Time
	row := h.db.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), parent_id, member_ids, assigned_instruments, created_at
		FROM respondent_groups WHERE id = $1`, id)
	if err := row.Scan(&p.ID, &p.Name, &p.Description, &parent, &mjson, &ajson, &createdAt); err != nil {
		if err == pgx.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	p.ParentID = parent
	_ = json.Unmarshal(mjson, &p.MemberIDs)
	if p.MemberIDs == nil {
		p.MemberIDs = []string{}
	}
	_ = json.Unmarshal(ajson, &p.AssignedInstruments)
	if p.AssignedInstruments == nil {
		p.AssignedInstruments = []string{}
	}
	p.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	writeJSON(w, http.StatusOK, p)
}
