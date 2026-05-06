package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

public class DemographicFieldDto {
    private String id;
    private String fieldKey;
    private String label;
    private String type;
    private boolean required;
    private String placeholder;
    private List<String> options = new ArrayList<>();
    private int sortOrder;
    private boolean active;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String fieldKey) { this.fieldKey = fieldKey; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }
    public String getPlaceholder() { return placeholder; }
    public void setPlaceholder(String placeholder) { this.placeholder = placeholder; }
    public List<String> getOptions() { return options; }
    public void setOptions(List<String> options) { this.options = options; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
