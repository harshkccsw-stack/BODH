package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.persistence.CascadeType;
import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.OrderBy;
import javax.persistence.Table;

@Entity
@Table(name = "items")
public class Item {

    @Id
    @Column(columnDefinition = "char(36)")
    private String id;

    @Column(name = "instrument_id", columnDefinition = "char(36)")
    private String instrumentId;

    private String vertical;

    @Column(name = "sub_domain")
    private String subDomain;

    // Question-level MQT scoring rows. The frontend's "question_scores" — a
    // score credited whenever the question is answered at all, regardless of
    // which option was picked. Was the items.sub_domains JSON array.
    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemQuestionScore> questionScores = new ArrayList<>();

    @Column(name = "item_format")
    private String itemFormat;

    @Column(columnDefinition = "text")
    private String stem;

    @Column(name = "media_url", columnDefinition = "text")
    private String mediaUrl;

    @Column(name = "media_type")
    private String mediaType;

    // MCQ options live in the item_options child table; per-option MQT
    // scoring on each ItemOption. @OrderBy ensures stable presentation order
    // (option 0 vs option 1). Lazy to avoid joining a deep tree on every
    // single-row read; reload via JPA when needed.
    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<ItemOption> options = new ArrayList<>();

    @Column(name = "irt_a")
    private Double irtA;

    @Column(name = "irt_b")
    private Double irtB;

    @Column(name = "irt_c")
    private Double irtC;

    @Column(name = "validation_status")
    private String validationStatus;

    @Column(name = "clinical_risk_flag")
    private boolean riskFlag;

    @Column(name = "risk_flag_rule", columnDefinition = "text")
    private String riskRule;

    @Column(name = "sequence_order")
    private Integer sequenceOrder;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "item_languages",
            joinColumns = @JoinColumn(name = "item_id"))
    @Column(name = "language", nullable = false, length = 8)
    private Set<String> languages = new HashSet<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getInstrumentId() { return instrumentId; }
    public void setInstrumentId(String instrumentId) { this.instrumentId = instrumentId; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getSubDomain() { return subDomain; }
    public void setSubDomain(String subDomain) { this.subDomain = subDomain; }
    public List<ItemQuestionScore> getQuestionScores() { return questionScores; }
    public void setQuestionScores(List<ItemQuestionScore> questionScores) { this.questionScores = questionScores; }
    public String getItemFormat() { return itemFormat; }
    public void setItemFormat(String itemFormat) { this.itemFormat = itemFormat; }
    public String getStem() { return stem; }
    public void setStem(String stem) { this.stem = stem; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public List<ItemOption> getOptions() { return options; }
    public void setOptions(List<ItemOption> options) { this.options = options; }
    public Double getIrtA() { return irtA; }
    public void setIrtA(Double irtA) { this.irtA = irtA; }
    public Double getIrtB() { return irtB; }
    public void setIrtB(Double irtB) { this.irtB = irtB; }
    public Double getIrtC() { return irtC; }
    public void setIrtC(Double irtC) { this.irtC = irtC; }
    public String getValidationStatus() { return validationStatus; }
    public void setValidationStatus(String validationStatus) { this.validationStatus = validationStatus; }
    public boolean isRiskFlag() { return riskFlag; }
    public void setRiskFlag(boolean riskFlag) { this.riskFlag = riskFlag; }
    public String getRiskRule() { return riskRule; }
    public void setRiskRule(String riskRule) { this.riskRule = riskRule; }
    public Integer getSequenceOrder() { return sequenceOrder; }
    public void setSequenceOrder(Integer sequenceOrder) { this.sequenceOrder = sequenceOrder; }
    public Set<String> getLanguages() { return languages; }
    public void setLanguages(Set<String> languages) { this.languages = languages; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
