package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;
import org.hibernate.annotations.TypeDefs;

import com.fasterxml.jackson.databind.JsonNode;
import com.vladmihalcea.hibernate.type.json.JsonNodeStringType;
import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "items")
@TypeDefs({
    @TypeDef(name = "json", typeClass = JsonStringType.class),
    @TypeDef(name = "json-node", typeClass = JsonNodeStringType.class)
})
public class Item {

    @Id
    @Column(columnDefinition = "char(36)")
    private String id;

    @Column(name = "instrument_id", columnDefinition = "char(36)")
    private String instrumentId;

    private String vertical;

    @Column(name = "sub_domain")
    private String subDomain;

    @Type(type = "json-node")
    @Column(name = "sub_domains", columnDefinition = "json")
    private JsonNode subDomains;

    @Column(name = "item_format")
    private String itemFormat;

    @Column(columnDefinition = "text")
    private String stem;

    @Column(name = "media_url", columnDefinition = "text")
    private String mediaUrl;

    @Column(name = "media_type")
    private String mediaType;

    @Type(type = "json-node")
    @Column(columnDefinition = "json")
    private JsonNode options;

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

    @Type(type = "json")
    @Column(columnDefinition = "json")
    private List<String> languages = new ArrayList<>();

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
    public JsonNode getSubDomains() { return subDomains; }
    public void setSubDomains(JsonNode subDomains) { this.subDomains = subDomains; }
    public String getItemFormat() { return itemFormat; }
    public void setItemFormat(String itemFormat) { this.itemFormat = itemFormat; }
    public String getStem() { return stem; }
    public void setStem(String stem) { this.stem = stem; }
    public String getMediaUrl() { return mediaUrl; }
    public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
    public String getMediaType() { return mediaType; }
    public void setMediaType(String mediaType) { this.mediaType = mediaType; }
    public JsonNode getOptions() { return options; }
    public void setOptions(JsonNode options) { this.options = options; }
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
    public List<String> getLanguages() { return languages; }
    public void setLanguages(List<String> languages) { this.languages = languages; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
