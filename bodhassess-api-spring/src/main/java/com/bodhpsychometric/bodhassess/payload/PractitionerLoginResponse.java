package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PractitionerLoginResponse {

    private String token;
    private PractitionerMe practitioner;

    public PractitionerLoginResponse() {}
    public PractitionerLoginResponse(String token, PractitionerMe practitioner) {
        this.token = token;
        this.practitioner = practitioner;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public PractitionerMe getPractitioner() { return practitioner; }
    public void setPractitioner(PractitionerMe practitioner) { this.practitioner = practitioner; }

    public static class PractitionerMe extends PractitionerDto {
        @JsonProperty("url_paths")
        private List<String> urlPaths = new ArrayList<>();

        public List<String> getUrlPaths() { return urlPaths; }
        public void setUrlPaths(List<String> urlPaths) { this.urlPaths = urlPaths; }
    }
}
