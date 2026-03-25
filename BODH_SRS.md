# SRS DOCUMENT -- BODH PSYCHOMETRIC PLATFORM (PsycheOS)

## 1. Introduction

### 1.1 Purpose

This document defines the functional and technical requirements for
developing the BODH Psychometric Platform (PsycheOS) --- an AI-powered
assessment and analytics platform.

### 1.2 Scope

The system will: - Deliver psychometric assessments - Provide AI-driven
insights - Support recruitment, education, and employee analytics -
Offer dashboards for multiple stakeholders

------------------------------------------------------------------------

## 2. System Overview

### 2.1 Product Perspective

A SaaS-based web platform consisting of: - Public website (marketing +
onboarding) - Assessment platform (test delivery) - Admin dashboard - AI
analytics engine

------------------------------------------------------------------------

## 3. User Roles

### 3.1 Super Admin

-   Manage platform, clients, pricing
-   Control assessments and analytics

### 3.2 Corporate Admin (HR)

-   Create assessments
-   Invite candidates/employees
-   View reports

### 3.3 Recruiter

-   Access candidate reports
-   Compare candidates

### 3.4 Candidate/User

-   Attempt assessments
-   View limited reports

### 3.5 Institution Admin

-   Manage students
-   Access learning insights

------------------------------------------------------------------------

## 4. Functional Requirements

### 4.1 Website Module (Public Interface)

-   Homepage (AI Psychometric Platform positioning)
-   Product pages
-   Pricing page
-   Demo booking
-   Login/Signup

### 4.2 Authentication System

-   Email/password login
-   OTP-based login
-   Role-based access control
-   Forgot password

### 4.3 Assessment Engine

-   Test creation (MCQ, situational, psychometric)
-   Time-based assessments
-   Adaptive testing
-   Question randomization
-   Multi-language support

### 4.4 Preloaded Assessment Library

-   Talent Acquisition Test
-   Personality Test
-   Learning Agility
-   Digital Readiness
-   Editable templates

### 4.5 AI Scoring & Analytics Engine

-   Automated scoring
-   Behavioral profiling
-   Candidate ranking
-   Fitment analysis
-   AI-generated reports

### 4.6 Dashboard Module

-   Candidate performance overview
-   Hiring analytics
-   Attrition risk indicators

### 4.7 360 Degree Feedback System

-   Multi-rater input
-   Anonymous feedback
-   AI-generated insights

### 4.8 Employee Engagement Module

-   Surveys
-   Engagement score
-   Attrition prediction

### 4.9 Adaptive Learning System

-   Student assessment
-   Career suggestions
-   Skill gap analysis

### 4.10 Reporting System

-   PDF reports
-   Graphical insights
-   Comparative analysis

### 4.11 Consultancy Module

-   Custom assessment builder
-   Report customization

------------------------------------------------------------------------

## 5. Non-Functional Requirements

### 5.1 Performance

-   Support 10,000+ users
-   Page load \< 3 seconds

### 5.2 Scalability

-   Cloud-based architecture

### 5.3 Security

-   SSL encryption
-   Role-based access
-   Compliance (DPDP/GDPR)

### 5.4 Availability

-   99.5% uptime

------------------------------------------------------------------------

## 6. Technology Requirements

-   Frontend: React / Next.js
-   Backend: Node.js / Python
-   Database: PostgreSQL / MongoDB
-   AI Layer: Python ML models
-   Cloud: AWS / GCP

------------------------------------------------------------------------

## 7. API Requirements

-   HRMS integrations
-   LMS integrations
-   Data APIs
-   Reporting APIs

------------------------------------------------------------------------

## 8. UI/UX Requirements

-   Clean UI
-   Mobile responsive
-   Dashboard-centric

------------------------------------------------------------------------

## 9. Future Enhancements

-   AI Interview Bot
-   Video analysis
-   Voice-based testing
-   Gamified assessments

------------------------------------------------------------------------

## 10. Workflow Example

### Hiring Flow

1.  HR creates test
2.  Candidate attempts
3.  AI evaluates
4.  Report generated

------------------------------------------------------------------------

## 11. Success Metrics

-   Completion rate
-   Prediction accuracy
-   Client retention
-   Engagement rate
