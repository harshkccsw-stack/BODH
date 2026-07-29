package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

public class BulkRespondentDtos {

    public static class Row {
        private String name;
        private String email;
        private String dob;
        private String consent;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getDob() { return dob; }
        public void setDob(String dob) { this.dob = dob; }
        public String getConsent() { return consent; }
        public void setConsent(String consent) { this.consent = consent; }
    }

    public static class Request {
        private List<Row> respondents = new ArrayList<>();

        public List<Row> getRespondents() { return respondents; }
        public void setRespondents(List<Row> respondents) { this.respondents = respondents; }
    }

    public static class Error {
        private int row;
        private String email;
        private String reason;

        public Error() {}
        public Error(int row, String email, String reason) {
            this.row = row; this.email = email; this.reason = reason;
        }
        public int getRow() { return row; }
        public void setRow(int row) { this.row = row; }
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }

    public static class Response {
        private int created;
        private int skipped;
        private List<Error> errors = new ArrayList<>();
        private List<RespondentDto> inserted = new ArrayList<>();

        public int getCreated() { return created; }
        public void setCreated(int created) { this.created = created; }
        public int getSkipped() { return skipped; }
        public void setSkipped(int skipped) { this.skipped = skipped; }
        public List<Error> getErrors() { return errors; }
        public void setErrors(List<Error> errors) { this.errors = errors; }
        public List<RespondentDto> getInserted() { return inserted; }
        public void setInserted(List<RespondentDto> inserted) { this.inserted = inserted; }
    }
}
