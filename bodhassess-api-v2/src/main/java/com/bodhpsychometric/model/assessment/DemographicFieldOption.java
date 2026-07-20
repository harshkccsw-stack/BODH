package com.bodhpsychometric.model.assessment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import com.bodhpsychometric.model.base.BaseEntity;

/**
 * One choice of a SELECT-type demographic field — ordered rows now (the
 * legacy Set lost display order).
 */
@Entity
@Table(name = "DemographicFieldOption",
        indexes = @Index(name = "idxDemographicOptionField", columnList = "fieldId"))
public class DemographicFieldOption extends BaseEntity {

    private static final long serialVersionUID = 1L;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "fieldId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDemographicOptionField"))
    private DemographicField field;

    @Column(name = "value", nullable = false, length = 255)
    private String value;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public DemographicField getField() { return field; }
    public void setField(DemographicField field) { this.field = field; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
