package com.bodhpsychometric.bodhassess.model;

import java.util.HashSet;
import java.util.Set;

import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.Table;

@Entity
@Table(name = "demographic_fields")
public class DemographicField {

    @Id
    private String id;

    @Column(name = "field_key")
    private String fieldKey;

    private String label;

    private String type;

    private boolean required;

    private String placeholder;

    // For select-type fields: the list of allowable choices. Was a JSON
    // array; now a join table so each option is its own row.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "demographic_field_options",
            joinColumns = @JoinColumn(name = "field_id"))
    @Column(name = "option_value", nullable = false, length = 255)
    private Set<String> options = new HashSet<>();

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
    public Set<String> getOptions() { return options; }
    public void setOptions(Set<String> options) { this.options = options; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
