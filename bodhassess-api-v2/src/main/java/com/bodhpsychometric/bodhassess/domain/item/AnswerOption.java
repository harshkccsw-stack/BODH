package com.bodhpsychometric.bodhassess.domain.item;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.bodhassess.domain.base.BaseEntity;

/**
 * One option of an {@link Item} — exclusively owned and frozen with it
 * (copy-on-write mints new option rows alongside the new item). Session
 * answers FK these rows directly, which is what makes historical answers
 * immune to authoring changes. sortOrder is only the authoring/bank-preview
 * order; per-questionnaire display order lives on QuestionnaireItemOption.
 */
@Entity
@Table(name = "AnswerOption",
        indexes = @Index(name = "idxOptionItem", columnList = "itemId"))
public class AnswerOption extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "itemId", nullable = false,
            foreignKey = @ForeignKey(name = "fkOptionItem"))
    private Item item;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    @Column(name = "text", columnDefinition = "TEXT")
    private String text;

    @Column(name = "mediaUrl", columnDefinition = "TEXT")
    private String mediaUrl;

    @Column(name = "mediaType", length = 30)
    private String mediaType;

    public Item getItem() { return item; }
    public void setItem(Item item) { this.item = item; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
}
