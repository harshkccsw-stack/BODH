package com.bodhpsychometric.bodhassess.payload;

/**
 * One row per (instrument, groupId) tuple — what the admin picks from the
 * Live Tracking selector. activeNow is filled in by the service after a
 * Redis lookup; the JPQL projection leaves it null.
 */
public class LiveAssessmentSummary {

    private String instrument;
    private String instrumentFullName;
    private String groupId;
    private String groupName;
    private long totalSessions;
    private long completed;
    private long activeNow;
    private long notStarted;

    public LiveAssessmentSummary() {}

    // Used by the JPQL constructor projection — counts come back as Long.
    public LiveAssessmentSummary(String instrument, String instrumentFullName,
                                 String groupId, String groupName,
                                 Long totalSessions, Long completed) {
        this.instrument = instrument;
        this.instrumentFullName = instrumentFullName;
        this.groupId = groupId;
        this.groupName = groupName;
        this.totalSessions = totalSessions == null ? 0L : totalSessions;
        this.completed = completed == null ? 0L : completed;
    }

    public String getInstrument() { return instrument; }
    public void setInstrument(String instrument) { this.instrument = instrument; }
    public String getInstrumentFullName() { return instrumentFullName; }
    public void setInstrumentFullName(String instrumentFullName) { this.instrumentFullName = instrumentFullName; }
    public String getGroupId() { return groupId; }
    public void setGroupId(String groupId) { this.groupId = groupId; }
    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public long getTotalSessions() { return totalSessions; }
    public void setTotalSessions(long totalSessions) { this.totalSessions = totalSessions; }
    public long getCompleted() { return completed; }
    public void setCompleted(long completed) { this.completed = completed; }
    public long getActiveNow() { return activeNow; }
    public void setActiveNow(long activeNow) { this.activeNow = activeNow; }
    public long getNotStarted() { return notStarted; }
    public void setNotStarted(long notStarted) { this.notStarted = notStarted; }
}
