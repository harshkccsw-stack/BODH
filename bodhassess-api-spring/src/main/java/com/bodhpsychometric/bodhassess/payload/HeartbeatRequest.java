package com.bodhpsychometric.bodhassess.payload;

public class HeartbeatRequest {
    private int currentIndex;
    private int totalQuestions;

    public int getCurrentIndex() { return currentIndex; }
    public void setCurrentIndex(int currentIndex) { this.currentIndex = currentIndex; }
    public int getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }
}
