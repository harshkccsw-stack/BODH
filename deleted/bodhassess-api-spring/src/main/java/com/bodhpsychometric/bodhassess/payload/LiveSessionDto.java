package com.bodhpsychometric.bodhassess.payload;

/** One participant row inside the Live Tracking page. */
public class LiveSessionDto {

    private String sessionId;
    private String respondentId;
    private String respondentName;
    private String respondentEmail;

    /** Persisted lifecycle status from the DB row: "Active" | "Completed". */
    private String sessionStatus;

    /** Computed live status: "not_started" | "live" | "idle" | "completed". */
    private String liveStatus;

    private Integer currentIndex;
    private Integer totalQuestions;
    private Integer percentComplete;

    private String lastSeen;
    private String startedAt;
    private String completedAt;

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getRespondentId() { return respondentId; }
    public void setRespondentId(String respondentId) { this.respondentId = respondentId; }
    public String getRespondentName() { return respondentName; }
    public void setRespondentName(String respondentName) { this.respondentName = respondentName; }
    public String getRespondentEmail() { return respondentEmail; }
    public void setRespondentEmail(String respondentEmail) { this.respondentEmail = respondentEmail; }
    public String getSessionStatus() { return sessionStatus; }
    public void setSessionStatus(String sessionStatus) { this.sessionStatus = sessionStatus; }
    public String getLiveStatus() { return liveStatus; }
    public void setLiveStatus(String liveStatus) { this.liveStatus = liveStatus; }
    public Integer getCurrentIndex() { return currentIndex; }
    public void setCurrentIndex(Integer currentIndex) { this.currentIndex = currentIndex; }
    public Integer getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(Integer totalQuestions) { this.totalQuestions = totalQuestions; }
    public Integer getPercentComplete() { return percentComplete; }
    public void setPercentComplete(Integer percentComplete) { this.percentComplete = percentComplete; }
    public String getLastSeen() { return lastSeen; }
    public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }
    public String getStartedAt() { return startedAt; }
    public void setStartedAt(String startedAt) { this.startedAt = startedAt; }
    public String getCompletedAt() { return completedAt; }
    public void setCompletedAt(String completedAt) { this.completedAt = completedAt; }
}
