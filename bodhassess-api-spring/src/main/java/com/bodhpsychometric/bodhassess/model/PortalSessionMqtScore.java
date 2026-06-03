package com.bodhpsychometric.bodhassess.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.Table;
import javax.persistence.UniqueConstraint;

/**
 * Per-MQT score row for a completed assessment session. Replaces the legacy
 * portal_sessions.mqt_scores JSON map of {mqt_id: {name, score}}.
 */
@Entity
@Table(name = "portal_session_mqt_scores", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_session_mqt",
                columnNames = {"session_id", "mqt_id"})
})
public class PortalSessionMqtScore {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private PortalSession session;

    @Column(name = "mqt_id", nullable = false, length = 64)
    private String mqtId;

    // Cached name so reports can render labels without joining back to the
    // questionnaire snapshot. Mirrors the previous JSON shape.
    @Column(name = "mqt_name")
    private String mqtName;

    @Column(nullable = false)
    private double score;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PortalSession getSession() { return session; }
    public void setSession(PortalSession session) { this.session = session; }
    public String getMqtId() { return mqtId; }
    public void setMqtId(String mqtId) { this.mqtId = mqtId; }
    public String getMqtName() { return mqtName; }
    public void setMqtName(String mqtName) { this.mqtName = mqtName; }
    public double getScore() { return score; }
    public void setScore(double score) { this.score = score; }
}
