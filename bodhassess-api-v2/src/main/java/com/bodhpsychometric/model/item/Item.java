package com.bodhpsychometric.model.item;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import com.bodhpsychometric.model.base.SoftDeletableEntity;

/**
 * The question — an IMMUTABLE content node. Content (format, stem, media,
 * options) is written once at creation; any content edit creates a NEW Item
 * (copy-on-write) chained through previousItem, and the editing questionnaire
 * repoints its usage row while every other questionnaire keeps this row
 * forever. Immutability is a service-layer contract, not a mapping feature —
 * repositories must never update content columns of a persisted item.
 *
 * Mutable metadata (exempt from copy-on-write): validationStatus, deletedAt
 * (bank hiding), and the kept-to-refine-later fields below.
 *
 * Carries NO scoring — trait credits live on the questionnaire usage edges.
 * The service enforces stem-or-media presence per format.
 */
@Entity
@Table(name = "Item",
        indexes = @Index(name = "idxItemPrevious", columnList = "previousItemId"))
public class Item extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @Enumerated(EnumType.STRING)
    @Column(name = "format", nullable = false, length = 30)
    private ItemFormat format;

    @Column(name = "stem", columnDefinition = "TEXT")
    private String stem;

    @Column(name = "mediaUrl", columnDefinition = "TEXT")
    private String mediaUrl;

    @Column(name = "mediaType", length = 30)
    private String mediaType;

    // Lineage: NULL = original authoring; set = this row was born by editing
    // that one. Authorship of each version is the inherited createdBy.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "previousItemId", foreignKey = @ForeignKey(name = "fkItemPrevious"))
    private Item previousItem;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<AnswerOption> options = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(name = "validationStatus", nullable = false, length = 20)
    private ValidationStatus validationStatus = ValidationStatus.DRAFT;

    // ── Kept from the old system, to be refined in a later pass ──────────
    @Column(name = "irtA")
    private Double irtA;

    @Column(name = "irtB")
    private Double irtB;

    @Column(name = "irtC")
    private Double irtC;

    @Column(name = "riskFlag", nullable = false)
    private boolean riskFlag;

    @Column(name = "riskRule", columnDefinition = "TEXT")
    private String riskRule;

    @Column(name = "subDomain", length = 150)
    private String subDomain;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "ItemLanguage",
            joinColumns = @JoinColumn(name = "itemId",
                    foreignKey = @ForeignKey(name = "fkItemLanguageItem")))
    @Column(name = "language", nullable = false, length = 8)
    private Set<String> languages = new HashSet<>();

    public ItemFormat getFormat() { return format; }
    public void setFormat(ItemFormat format) { this.format = format; }
    public String getStem() { return stem; }
    public void setStem(String stem) { this.stem = stem; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public Item getPreviousItem() { return previousItem; }
    public void setPreviousItem(Item previousItem) { this.previousItem = previousItem; }
    public List<AnswerOption> getOptions() { return options; }
    public void setOptions(List<AnswerOption> options) { this.options = options; }
    public ValidationStatus getValidationStatus() { return validationStatus; }
    public void setValidationStatus(ValidationStatus validationStatus) { this.validationStatus = validationStatus; }
    public Double getIrtA() { return irtA; }
    public void setIrtA(Double irtA) { this.irtA = irtA; }
    public Double getIrtB() { return irtB; }
    public void setIrtB(Double irtB) { this.irtB = irtB; }
    public Double getIrtC() { return irtC; }
    public void setIrtC(Double irtC) { this.irtC = irtC; }
    public boolean isRiskFlag() { return riskFlag; }
    public void setRiskFlag(boolean riskFlag) { this.riskFlag = riskFlag; }
    public String getRiskRule() { return riskRule; }
    public void setRiskRule(String riskRule) { this.riskRule = riskRule; }
    public String getSubDomain() { return subDomain; }
    public void setSubDomain(String subDomain) { this.subDomain = subDomain; }
    public Set<String> getLanguages() { return languages; }
    public void setLanguages(Set<String> languages) { this.languages = languages; }

    public void addOption(AnswerOption option) {
        options.add(option);
        option.setItem(this);
    }

    public void removeOption(AnswerOption option) {
        options.remove(option);
        option.setItem(null);
    }
}
