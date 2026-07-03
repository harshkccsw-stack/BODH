package com.bodhpsychometric.bodhassess.payload;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class SessionDtos {

    public static class CreateSessionRequest {
        @JsonProperty("practitioner_id") private String practitionerId;
        @JsonProperty("respondent_id")   private String respondentId;
        @JsonProperty("instrument_id")   private String instrumentId;
        @JsonProperty("consent_id")      private String consentId;
        private String vertical;
        private String language;
        @JsonProperty("is_proctored")    private boolean isProctored;
        @JsonProperty("tenant_id")       private String tenantId;

        public String getPractitionerId() { return practitionerId; }
        public void setPractitionerId(String practitionerId) { this.practitionerId = practitionerId; }
        public String getRespondentId() { return respondentId; }
        public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
        public String getInstrumentId() { return instrumentId; }
        public void setInstrumentId(String instrumentId) { this.instrumentId = instrumentId; }
        public String getConsentId() { return consentId; }
        public void setConsentId(String consentId) { this.consentId = consentId; }
        public String getVertical() { return vertical; }
        public void setVertical(String vertical) { this.vertical = vertical; }
        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }
        public boolean isProctored() { return isProctored; }
        public void setProctored(boolean proctored) { isProctored = proctored; }
        public String getTenantId() { return tenantId; }
        public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    }

    public static class CreateSessionResponse {
        private String id;
        private String status;
        private String message;

        public CreateSessionResponse() {}
        public CreateSessionResponse(String id, String status, String message) {
            this.id = id; this.status = status; this.message = message;
        }
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    public static class SessionRow {
        private String id;
        private String vertical;
        private String language;
        private String status;
        @JsonProperty("is_proctored")   private boolean isProctored;
        @JsonProperty("trust_score")    private Double trustScore;
        @JsonProperty("theta_estimate") private double thetaEstimate;
        @JsonProperty("started_at")     private String startedAt;
        @JsonProperty("completed_at")   private String completedAt;
        @JsonProperty("created_at")     private String createdAt;
        @JsonProperty("respondent_name") private String respondentName;
        @JsonProperty("instrument_name") private String instrumentName;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getVertical() { return vertical; }
        public void setVertical(String vertical) { this.vertical = vertical; }
        public String getLanguage() { return language; }
        public void setLanguage(String language) { this.language = language; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public boolean isProctored() { return isProctored; }
        public void setProctored(boolean proctored) { isProctored = proctored; }
        public Double getTrustScore() { return trustScore; }
        public void setTrustScore(Double trustScore) { this.trustScore = trustScore; }
        public double getThetaEstimate() { return thetaEstimate; }
        public void setThetaEstimate(double thetaEstimate) { this.thetaEstimate = thetaEstimate; }
        public String getStartedAt() { return startedAt; }
        public void setStartedAt(String startedAt) { this.startedAt = startedAt; }
        public String getCompletedAt() { return completedAt; }
        public void setCompletedAt(String completedAt) { this.completedAt = completedAt; }
        public String getCreatedAt() { return createdAt; }
        public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
        public String getRespondentName() { return respondentName; }
        public void setRespondentName(String respondentName) { this.respondentName = respondentName; }
        public String getInstrumentName() { return instrumentName; }
        public void setInstrumentName(String instrumentName) { this.instrumentName = instrumentName; }
    }

    public static class SessionListResponse {
        private List<SessionRow> data;
        private int total;

        public SessionListResponse() {}
        public SessionListResponse(List<SessionRow> data, int total) { this.data = data; this.total = total; }

        public List<SessionRow> getData() { return data; }
        public void setData(List<SessionRow> data) { this.data = data; }
        public int getTotal() { return total; }
        public void setTotal(int total) { this.total = total; }
    }
}
