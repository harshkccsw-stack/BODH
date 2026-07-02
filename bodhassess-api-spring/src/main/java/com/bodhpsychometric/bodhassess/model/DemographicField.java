package com.bodhpsychometric.bodhassess.model;

import java.util.ArrayList;
import java.util.List;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "demographic_fields")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class DemographicField {

    @Id
    private String id;

    @Column(name = "field_key")
    private String fieldKey;

    private String label;

    private String type;

    private boolean required;

    private String placeholder;

    @Type(type = "json")
    @Column(columnDefinition = "json")
    private List<String> options = new ArrayList<>();

    @Column(name = "sort_order")
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
