package com.bodhpsychometric.model.report;

import java.time.OffsetDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * One immutable saved state of a {@link ReportRule}.
 *
 * <p>Never updated after insert. Editing a rule writes version N+1, and a
 * computation pins the version it selected — so an approved report stays
 * explicable no matter what happens to the rule afterwards.
 *
 * <p>A rule is defined in exactly one of two ways, and the distinction is the
 * point of the whole table:
 *
 * <ul>
 *   <li>{@link #KIND_EXPRESSION} — a formula in the Data Studio grammar over
 *       real column keys. <b>Validated against the live per-assessment column
 *       list at save time</b>, so it cannot name a column that does not exist.
 *       {@code referencedKeys} and {@code isPopulation} are derived from the
 *       parser, never asked.</li>
 *   <li>{@link #KIND_STATEMENT} — plain language, for the rules that are not
 *       pure maths (banding narratives, clinical caveats, anything the grammar
 *       has no way to say). Stored raw and sent to the model verbatim; never
 *       parsed and never evaluated here.</li>
 * </ul>
 */
@Entity
@Table(name = "ReportRuleVersion")
public class ReportRuleVersion implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    /** A formula in the Data Studio grammar. Machine-checkable. */
    public static final String KIND_EXPRESSION = "EXPRESSION";

    /** The psychometrician's own words. Not parsed. */
    public static final String KIND_STATEMENT = "STATEMENT";

    public static final String RESULT_NUMBER = "NUMBER";
    public static final String RESULT_TERM = "TERM";
    public static final String RESULT_TEXT = "TEXT";

    public static boolean isKnownKind(String kind) {
        return KIND_EXPRESSION.equals(kind) || KIND_STATEMENT.equals(kind);
    }

    public static boolean isKnownResultType(String type) {
        return RESULT_NUMBER.equals(type) || RESULT_TERM.equals(type) || RESULT_TEXT.equals(type);
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportRuleVersionId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportRuleId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRrvRule"))
    private ReportRule rule;

    @Column(name = "version", nullable = false)
    private int version;

    @Column(name = "definitionKind", nullable = false, length = 16)
    private String definitionKind;

    @Column(name = "expression", columnDefinition = "TEXT")
    private String expression;

    @Column(name = "statementText", columnDefinition = "TEXT")
    private String statementText;

    @Column(name = "resultType", length = 16)
    private String resultType;

    /** JSON array of column keys the expression referenced. */
    @Column(name = "referencedKeysJson", columnDefinition = "TEXT")
    private String referencedKeysJson;

    /**
     * True when the expression uses a population function, i.e. its answer
     * moves as more respondents complete. Derived from the parser's
     * {@code evalTarget}, so it cannot disagree with what the formula does.
     */
    @Column(name = "isPopulation", nullable = false)
    private boolean population;

    /** Which assessment the expression was checked against when saved. */
    @Column(name = "validatedAssessmentId")
    private Long validatedAssessmentId;

    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "createdByUserId")
    private Long createdByUserId;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = OffsetDateTime.now();
    }

    public boolean isExpression() {
        return KIND_EXPRESSION.equals(definitionKind);
    }

    /** What the model is shown for this rule — spec §5 wants it unparaphrased. */
    public String definitionText() {
        return isExpression() ? expression : statementText;
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportRuleVersionId() {
        return reportRuleVersionId;
    }

    public void setReportRuleVersionId(Long reportRuleVersionId) {
        this.reportRuleVersionId = reportRuleVersionId;
    }

    public ReportRule getRule() {
        return rule;
    }

    public void setRule(ReportRule rule) {
        this.rule = rule;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public String getDefinitionKind() {
        return definitionKind;
    }

    public void setDefinitionKind(String definitionKind) {
        this.definitionKind = definitionKind;
    }

    public String getExpression() {
        return expression;
    }

    public void setExpression(String expression) {
        this.expression = expression;
    }

    public String getStatementText() {
        return statementText;
    }

    public void setStatementText(String statementText) {
        this.statementText = statementText;
    }

    public String getResultType() {
        return resultType;
    }

    public void setResultType(String resultType) {
        this.resultType = resultType;
    }

    public String getReferencedKeysJson() {
        return referencedKeysJson;
    }

    public void setReferencedKeysJson(String referencedKeysJson) {
        this.referencedKeysJson = referencedKeysJson;
    }

    public boolean isPopulation() {
        return population;
    }

    public void setPopulation(boolean population) {
        this.population = population;
    }

    public Long getValidatedAssessmentId() {
        return validatedAssessmentId;
    }

    public void setValidatedAssessmentId(Long validatedAssessmentId) {
        this.validatedAssessmentId = validatedAssessmentId;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }
}
