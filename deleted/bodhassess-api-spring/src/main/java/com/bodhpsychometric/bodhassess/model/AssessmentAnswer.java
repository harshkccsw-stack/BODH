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
 * One row per (assessment session, question) — replaces the legacy
 * portal_sessions.answers JSON blob so per-question responses are queryable
 * and joinable. MCQ answers populate optionIndex; free-text answers
 * populate freeText. Exactly one is expected to be non-null per row.
 */
@Entity
@Table(name = "assessment_answers", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_answer_session_question",
                columnNames = {"session_id", "question_id"})
})
public class AssessmentAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private PortalSession session;

    @Column(name = "question_id", nullable = false, length = 64)
    private String questionId;

    @Column(name = "option_index")
    private Integer optionIndex;

    @Column(name = "free_text", columnDefinition = "text")
    private String freeText;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PortalSession getSession() { return session; }
    public void setSession(PortalSession session) { this.session = session; }
    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public Integer getOptionIndex() { return optionIndex; }
    public void setOptionIndex(Integer optionIndex) { this.optionIndex = optionIndex; }
    public String getFreeText() { return freeText; }
    public void setFreeText(String freeText) { this.freeText = freeText; }
}
