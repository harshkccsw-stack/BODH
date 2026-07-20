package com.bodhpsychometric.model.demographics;

import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Registry of custom demographic fields — one row is one field ("Grade",
 * "School Name", "City"). Assessments pick from this registry via
 * {@link AssessmentDemographicField}; the field itself carries only what the
 * input IS, while per-assessment concerns (order, required) live on the
 * mapping.
 */
@Entity
@Table(name = "DemographicField",
        uniqueConstraints = @UniqueConstraint(name = "uqDemographicFieldLabel", columnNames = "label"))
public class DemographicField implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long demographicFieldId;

    /** What the student sees above the input. */
    @Column(name = "label", nullable = false, length = 150)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "fieldType", nullable = false, length = 16)
    private DemographicFieldType fieldType = DemographicFieldType.TEXT;

    @Column(name = "placeholder", length = 255)
    private String placeholder;

    /**
     * Choices for DROPDOWN fields, in display order; empty for other types.
     * Plain strings on purpose — choices have no identity or payload of
     * their own.
     */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "DemographicFieldOption",
            joinColumns = @JoinColumn(name = "demographicFieldId",
                    foreignKey = @ForeignKey(name = "fkDemographicFieldOptionField")))
    @OrderColumn(name = "sortOrder")
    @Column(name = "optionValue", nullable = false, length = 255)
    private List<String> options = new ArrayList<>();

    public Long getDemographicFieldId() {
        return demographicFieldId;
    }

    public void setDemographicFieldId(Long demographicFieldId) {
        this.demographicFieldId = demographicFieldId;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public DemographicFieldType getFieldType() {
        return fieldType;
    }

    public void setFieldType(DemographicFieldType fieldType) {
        this.fieldType = fieldType;
    }

    public String getPlaceholder() {
        return placeholder;
    }

    public void setPlaceholder(String placeholder) {
        this.placeholder = placeholder;
    }

    public List<String> getOptions() {
        return options;
    }

    public void setOptions(List<String> options) {
        this.options = options;
    }
}
