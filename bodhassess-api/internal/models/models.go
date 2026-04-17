package models

import (
	"time"

	"github.com/google/uuid"
)

type Tenant struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	Slug        string     `json:"slug"`
	Domain      *string    `json:"domain,omitempty"`
	Vertical    string     `json:"vertical"`
	Tier        string     `json:"tier"`
	IsWhitelabel bool      `json:"is_whitelabel"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
}

type User struct {
	ID              uuid.UUID  `json:"id"`
	TenantID        uuid.UUID  `json:"tenant_id"`
	Email           string     `json:"email"`
	Name            string     `json:"name"`
	Role            string     `json:"role"`
	Verticals       []string   `json:"verticals"`
	PrimaryLanguage string     `json:"primary_language"`
	IsActive        bool       `json:"is_active"`
	LastLogin       *time.Time `json:"last_login,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Instrument struct {
	ID              uuid.UUID  `json:"id"`
	TenantID        *uuid.UUID `json:"tenant_id,omitempty"`
	Name            string     `json:"name"`
	ShortName       *string    `json:"short_name,omitempty"`
	Vertical        string     `json:"vertical"`
	Category        *string    `json:"category,omitempty"`
	Description     *string    `json:"description,omitempty"`
	ItemCount       int        `json:"item_count"`
	DurationMinutes *int       `json:"duration_minutes,omitempty"`
	Languages       []string   `json:"languages"`
	TierRequired    string     `json:"tier_required"`
	IsAdaptive      bool       `json:"is_adaptive"`
	IsFixedSequence bool       `json:"is_fixed_sequence"`
	NormStatus      string     `json:"norm_status"`
	AgeRange        *string    `json:"age_range,omitempty"`
	IsPublished     bool       `json:"is_published"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Session struct {
	ID              uuid.UUID  `json:"id"`
	TenantID        uuid.UUID  `json:"tenant_id"`
	PractitionerID  uuid.UUID  `json:"practitioner_id"`
	RespondentID    uuid.UUID  `json:"respondent_id"`
	InstrumentID    uuid.UUID  `json:"instrument_id"`
	ConsentID       uuid.UUID  `json:"consent_id"`
	Vertical        string     `json:"vertical"`
	Language        string     `json:"language"`
	Status          string     `json:"status"`
	IsProctored     bool       `json:"is_proctored"`
	TrustScore      *float64   `json:"trust_score,omitempty"`
	ThetaEstimate   float64    `json:"theta_estimate"`
	StartedAt       *time.Time `json:"started_at,omitempty"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type Report struct {
	ID              uuid.UUID  `json:"id"`
	TenantID        uuid.UUID  `json:"tenant_id"`
	SessionID       uuid.UUID  `json:"session_id"`
	Vertical        string     `json:"vertical"`
	ReportType      string     `json:"report_type"`
	Status          string     `json:"status"`
	DiagnosticCodes []string   `json:"diagnostic_codes,omitempty"`
	PDFPath         *string    `json:"pdf_path,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

type ConsentRecord struct {
	ID           uuid.UUID  `json:"id"`
	TenantID     uuid.UUID  `json:"tenant_id"`
	RespondentID uuid.UUID  `json:"respondent_id"`
	ConsentType  string     `json:"consent_type"`
	Purpose      string     `json:"purpose"`
	Status       string     `json:"status"`
	GrantedAt    *time.Time `json:"granted_at,omitempty"`
	Method       *string    `json:"method,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}
