package com.bodhpsychometric.bodhassess.domain.assessment;

import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.auth.base.SoftDeletableEntity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * Global registry of registration-form fields. Questionnaires pick from it
 * via QuestionnaireDemographicField; session answers FK it. `active` is the
 * "currently offered to authors" toggle — distinct from deletedAt.
 */
@Entity
@Table(name = "DemographicField",
        uniqueConstraints = @UniqueConstraint(name = "uqDemographicFieldKey",
                columnNames = "fieldKey"))
public class DemographicField extends SoftDeletableEntity {

    private static final long serialVersionUID = 1L;

    @Column(name = "fieldKey", nullable = false, length = 128)
    private String fieldKey;

    @Column(name = "label", nullable = false, length = 200)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private DemographicFieldType type;

    @Column(name = "required", nullable = false)
    private boolean required;

    @Column(name = "placeholder", length = 255)
    private String placeholder;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @OneToMany(mappedBy = "field", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<DemographicFieldOption> options = new ArrayList<>();

    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String fieldKey) { this.fieldKey = fieldKey; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public DemographicFieldType getType() { return type; }
    public void setType(DemographicFieldType type) { this.type = type; }
    public boolean isRequired() { return required; }
    public void setRequired(boolean required) { this.required = required; }
    public String getPlaceholder() { return placeholder; }
    public void setPlaceholder(String placeholder) { this.placeholder = placeholder; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public List<DemographicFieldOption> getOptions() { return options; }
    public void setOptions(List<DemographicFieldOption> options) { this.options = options; }

    public void addOption(DemographicFieldOption option) {
        options.add(option);
        option.setField(this);
    }

    public void removeOption(DemographicFieldOption option) {
        options.remove(option);
        option.setField(null);
    }
}
