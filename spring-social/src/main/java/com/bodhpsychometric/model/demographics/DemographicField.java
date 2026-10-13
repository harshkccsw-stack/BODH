package com.bodhpsychometric.model.demographics;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.bodhpsychometric.model.demographics.enums.DemographicFieldType;
import com.bodhpsychometric.model.question.enums.AnswerFormat;

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
 * {@link QuestionnaireDemographicField}; the field itself carries only what
 * the input IS, while per-questionnaire concerns (order, required) live on the
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

    /**
     * The write-in choice ("Other (please specify)") on a DROPDOWN or
     * CHECKLIST — NULL when the field has none. Deliberately NOT one of
     * {@link #options}: it is always delivered last, and picking it requires
     * the respondent to type, which lands in DemographicResponse.otherText.
     * A plain "Other" with no text box is just an ordinary option.
     */
    @Column(name = "otherOptionLabel", length = 255)
    private String otherOptionLabel;

    /**
     * NUMBER fields only (V51, whole numbers since V52): the smallest and
     * largest number accepted, both inclusive, either one optional — null is
     * an open end, both null is any whole number. 0 … AnswerFormat.MAX_WHOLE_NUMBER,
     * like a Number question's range. NULL on every other type; the field
     * flow clears both when the type is not NUMBER. Once answered, a new
     * range must still contain every answer.
     */
    @Column(name = "numberMin")
    private Long numberMin;

    @Column(name = "numberMax")
    private Long numberMax;

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

    public String getOtherOptionLabel() {
        return otherOptionLabel;
    }

    public void setOtherOptionLabel(String otherOptionLabel) {
        this.otherOptionLabel = otherOptionLabel;
    }

    public Long getNumberMin() {
        return numberMin;
    }

    public void setNumberMin(Long numberMin) {
        this.numberMin = numberMin;
    }

    public Long getNumberMax() {
        return numberMax;
    }

    public void setNumberMax(Long numberMax) {
        this.numberMax = numberMax;
    }

    /**
     * True when {@code typed} (already trimmed) is a NUMBER answer this field
     * accepts: a whole number in digits only — the Number question's rule,
     * AnswerFormat.WHOLE_NUMBER (no decimal point, sign or separators, at
     * most 15 digits) — inside the range, both ends inclusive.
     */
    public boolean acceptsNumber(String typed) {
        return AnswerFormat.WHOLE_NUMBER.accepts(typed) && AnswerFormat.inRange(typed, numberMin, numberMax);
    }

    /**
     * The range in the respondent's words — "from 18 to 60", "of 18 or more",
     * "up to 100" — or null when there is none: AnswerFormat.rangePhrase, the
     * Number question's wording, which the portal mirrors word for word.
     */
    public String numberRangePhrase() {
        return AnswerFormat.rangePhrase(numberMin, numberMax);
    }

    /**
     * Every pickable choice in display order: the options, then the write-in
     * last. Empty for the free-input types. Readers order a checklist's ticks
     * by this, so the same ticks always print the same way.
     */
    public List<String> choices() {
        if (!fieldType.hasChoices()) {
            return List.of();
        }
        List<String> choices = new ArrayList<>(options);
        if (otherOptionLabel != null) {
            choices.add(otherOptionLabel);
        }
        return choices;
    }

    /**
     * Stored values in this field's own choice order (the write-in last), so
     * the same ticks always print the same way. A value that is no longer a
     * choice keeps its place after them rather than vanishing; on a
     * single-value field this is just its one value.
     */
    public List<String> inChoiceOrder(List<String> values) {
        List<String> choices = choices();
        return values.stream()
                .sorted(Comparator.comparingInt(v -> {
                    int at = choices.indexOf(v);
                    return at < 0 ? Integer.MAX_VALUE : at;
                }))
                .toList();
    }
}
