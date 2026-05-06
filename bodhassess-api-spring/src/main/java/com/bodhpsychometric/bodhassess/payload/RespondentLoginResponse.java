package com.bodhpsychometric.bodhassess.payload;

public class RespondentLoginResponse {
    private String token;
    private RespondentDto respondent;

    public RespondentLoginResponse() {}
    public RespondentLoginResponse(String token, RespondentDto respondent) {
        this.token = token;
        this.respondent = respondent;
    }

    public String getToken() { return token; }
    public void setToken(String token) { this.token = token; }
    public RespondentDto getRespondent() { return respondent; }
    public void setRespondent(RespondentDto respondent) { this.respondent = respondent; }
}
