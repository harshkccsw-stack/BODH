package com.bodhpsychometric.model.question;

import com.bodhpsychometric.model.question.enums.ContentType;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * Table is QuestionOption, not Option — OPTION is a reserved word in MySQL
 * and would break DDL unless quoted on every statement.
 */
@Entity
@Table(name = "QuestionOption")
public class Option implements java.io.Serializable {
    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long optionId;

    /**
     * Owning side of Question 1—* Option: the FK column lives here. An option
     * never exists without its question, hence optional = false.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "questionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkQuestionOptionQuestion"))
    private Question question;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    /** What this option is made of — same scheme as the question stem. */
    @Enumerated(EnumType.STRING)
    @Column(name = "contentType", nullable = false, length = 10)
    private ContentType contentType = ContentType.TEXT;

    @Column(name = "optionText", columnDefinition = "TEXT")
    private String optionText;

    /**
     * Optional help text under this option's label — "about once a month" —
     * shown to the RESPONDENT. Null means none; blank is normalised to null.
     *
     * <p>Not part of the option's IDENTITY: QuestionController's optionsChanged
     * comparison ignores it and syncs it in place instead, so editing a
     * description never rebuilds the option rows and can therefore be done on
     * a question that already has answers.
     */
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** Asset location when contentType is not TEXT: uploaded file path for IMAGE/VIDEO, external link for URL. */
    @Column(name = "mediaUrl", columnDefinition = "TEXT")
    private String mediaUrl;


    public Long getOptionId() {
        return optionId;
    }

    public Question getQuestion() {
        return question;
    }

    public void setQuestion(Question question) {
        this.question = question;
    }

    public void setOptionId(Long optionId) {
        this.optionId = optionId;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String getOptionText() {
        return optionText;
    }

    public void setOptionText(String optionText) {
        this.optionText = optionText;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getMediaUrl() {
        return mediaUrl;
    }

    public void setMediaUrl(String mediaUrl) {
        this.mediaUrl = mediaUrl;
    }

    public ContentType getContentType() {
        return contentType;
    }

    public void setContentType(ContentType contentType) {
        this.contentType = contentType;
    }

    
}
