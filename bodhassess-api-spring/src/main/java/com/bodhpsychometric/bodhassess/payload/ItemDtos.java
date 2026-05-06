package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class ItemDtos {

    public static class SubDomainWeight {
        private String domain;
        private double weight;

        public String getDomain() { return domain; }
        public void setDomain(String domain) { this.domain = domain; }
        public double getWeight() { return weight; }
        public void setWeight(double weight) { this.weight = weight; }
    }

    public static class CreateItemRequest {
        @JsonProperty("sub_domain")          private String subDomain;
        @JsonProperty("sub_domains")         private List<SubDomainWeight> subDomains = new ArrayList<>();
        private String format;
        private String stem;
        @JsonProperty("media_url")           private String mediaUrl;
        @JsonProperty("media_type")          private String mediaType;
        private Object options;
        @JsonProperty("irt_a")               private Double irtA;
        @JsonProperty("irt_b")               private Double irtB;
        @JsonProperty("irt_c")               private Double irtC;
        @JsonProperty("clinical_risk_flag")  private boolean riskFlag;
        @JsonProperty("risk_flag_rule")      private String riskRule;
        @JsonProperty("sequence_order")      private Integer sequenceOrder;
        private List<String> languages = new ArrayList<>();

        public String getSubDomain() { return subDomain; }
        public void setSubDomain(String subDomain) { this.subDomain = subDomain; }
        public List<SubDomainWeight> getSubDomains() { return subDomains; }
        public void setSubDomains(List<SubDomainWeight> subDomains) { this.subDomains = subDomains; }
        public String getFormat() { return format; }
        public void setFormat(String format) { this.format = format; }
        public String getStem() { return stem; }
        public void setStem(String stem) { this.stem = stem; }
        public String getMediaUrl() { return mediaUrl; }
        public void setMediaUrl(String mediaUrl) { this.mediaUrl = mediaUrl; }
        public String getMediaType() { return mediaType; }
        public void setMediaType(String mediaType) { this.mediaType = mediaType; }
        public Object getOptions() { return options; }
        public void setOptions(Object options) { this.options = options; }
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
        public Integer getSequenceOrder() { return sequenceOrder; }
        public void setSequenceOrder(Integer sequenceOrder) { this.sequenceOrder = sequenceOrder; }
        public List<String> getLanguages() { return languages; }
        public void setLanguages(List<String> languages) { this.languages = languages; }
    }

    public static class BulkCreateItemsRequest {
        private List<CreateItemRequest> items = new ArrayList<>();
        public List<CreateItemRequest> getItems() { return items; }
        public void setItems(List<CreateItemRequest> items) { this.items = items; }
    }

    public static class CreateItemResponse {
        private String id;
        @JsonProperty("instrument_id") private String instrumentId;
        private String stem;
        private String format;
        private String message;

        public CreateItemResponse() {}
        public CreateItemResponse(String id, String instrumentId, String stem, String format, String message) {
            this.id = id; this.instrumentId = instrumentId; this.stem = stem; this.format = format; this.message = message;
        }
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getInstrumentId() { return instrumentId; }
        public void setInstrumentId(String instrumentId) { this.instrumentId = instrumentId; }
        public String getStem() { return stem; }
        public void setStem(String stem) { this.stem = stem; }
        public String getFormat() { return format; }
        public void setFormat(String format) { this.format = format; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    public static class BulkCreateItemsResponse {
        private int created;
        private int total;
        @JsonProperty("instrument_id") private String instrumentId;
        private String message;

        public BulkCreateItemsResponse() {}
        public BulkCreateItemsResponse(int created, int total, String instrumentId, String message) {
            this.created = created; this.total = total; this.instrumentId = instrumentId; this.message = message;
        }
        public int getCreated() { return created; }
        public void setCreated(int created) { this.created = created; }
        public int getTotal() { return total; }
        public void setTotal(int total) { this.total = total; }
        public String getInstrumentId() { return instrumentId; }
        public void setInstrumentId(String instrumentId) { this.instrumentId = instrumentId; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }

    public static class ItemRow {
        private String id;
        @JsonProperty("sub_domain")        private String subDomain;
        private String format;
        private String stem;
        private Object options;
        @JsonProperty("irt_a")             private Double irtA;
        @JsonProperty("irt_b")             private Double irtB;
        @JsonProperty("irt_c")             private Double irtC;
        @JsonProperty("validation_status") private String validationStatus;
        @JsonProperty("clinical_risk_flag") private boolean riskFlag;
        @JsonProperty("sequence_order")    private Integer sequence;
        @JsonProperty("created_at")        private String createdAt;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getSubDomain() { return subDomain; }
        public void setSubDomain(String subDomain) { this.subDomain = subDomain; }
        public String getFormat() { return format; }
        public void setFormat(String format) { this.format = format; }
        public String getStem() { return stem; }
        public void setStem(String stem) { this.stem = stem; }
        public Object getOptions() { return options; }
        public void setOptions(Object options) { this.options = options; }
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
        public Integer getSequence() { return sequence; }
        public void setSequence(Integer sequence) { this.sequence = sequence; }
        public String getCreatedAt() { return createdAt; }
        public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    }

    public static class ItemListResponse {
        private List<ItemRow> data;
        private int total;

        public ItemListResponse() {}
        public ItemListResponse(List<ItemRow> data, int total) { this.data = data; this.total = total; }

        public List<ItemRow> getData() { return data; }
        public void setData(List<ItemRow> data) { this.data = data; }
        public int getTotal() { return total; }
        public void setTotal(int total) { this.total = total; }
    }
}
