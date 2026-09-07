package com.bodhpsychometric.model.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One {@code ${tag}} found in a template, and the answer to "what fills this?".
 *
 * <p>Rows are not authored directly. They are reconciled from the template's
 * HTML on every save: a tag that appears gets a row in state
 * {@link #TYPE_UNBOUND}, a tag that disappears loses its row. The practitioner
 * then answers each one, which is why UNBOUND is a real stored value rather
 * than a null — "nobody has answered this yet" is exactly the thing the
 * authoring checklist counts.
 *
 * <p>Three binder types are accepted. Two need no computation at all, which is
 * what lets a real PDF ship before any rule engine exists; the third says the
 * value comes from a computation, without saying which:
 *
 * <ul>
 *   <li>{@link #TYPE_CORE} — a fact already in the database about the
 *       respondent or the attempt.</li>
 *   <li>{@link #TYPE_LITERAL} — fixed text. Lets a tag be answered "nothing
 *       computes this, it just says this", without forcing every heading and
 *       disclaimer through the formula machinery.</li>
 *   <li>{@link #TYPE_COMPUTED} — a computation supplies this. Not a
 *       computation <i>reference</i>: the binding says only that the value
 *       comes from outside the template, which is what a template author
 *       actually knows. Which computation is a per-assessment question, and a
 *       portable template must not answer it.</li>
 * </ul>
 *
 * <p>{@code COMPUTED} exists because {@code UNBOUND} was carrying two
 * different facts. "Nobody has answered this yet" and "a computation fills
 * this" are opposite states — the first is unfinished work, the second is a
 * decision — and with one value for both, nothing downstream could tell them
 * apart: {@link #isBound()} understated the checklist, publish refused a
 * template that was in fact complete, and the prompt assembler had no way to
 * ask for narrative tags without also asking for headings.
 *
 * <p><b>What this does not do</b> is make a computed value appear. A
 * {@code COMPUTED} tag still resolves to its fallback text, because nothing
 * merges computed values into a render yet. Publishing such a template is
 * therefore allowed and delivering from it is not — the gate belongs on the
 * batch path in P4, where the computation is in scope and its output keys can
 * be checked against these tags. Until then a published template with computed
 * tags is a layout that has been signed off, not a report that can be sent.
 *
 * <p>{@code VALUE}, {@code NARRATIVE}, {@code TABLE} and {@code CHART} refine
 * {@code COMPUTED} in P4 by naming the SHAPE of what comes back, once
 * {@code report_computation} exists to point at. They are named here so the
 * vocabulary is settled, but a binding cannot be set to one yet —
 * {@link #isImplemented(String)} is what refuses it, with a message that says
 * so rather than a validation error nobody can act on.
 */
@Entity
@Table(name = "ReportTagBinding")
public class ReportTagBinding implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    /** Found in the HTML, nobody has said what fills it. The default. */
    public static final String TYPE_UNBOUND = "UNBOUND";

    /** A fact about the respondent or attempt — see {@link ReportCoreFields}. */
    public static final String TYPE_CORE = "CORE";

    /** Fixed text: headings, boilerplate, disclaimers. */
    public static final String TYPE_LITERAL = "LITERAL";

    /**
     * A computation fills this. Answered, but not from anything the template
     * itself holds — and deliberately without naming which computation.
     */
    public static final String TYPE_COMPUTED = "COMPUTED";

    // ── P4, named but not yet accepted: the SHAPE of a computed value ─────

    public static final String TYPE_VALUE = "VALUE";
    public static final String TYPE_NARRATIVE = "NARRATIVE";
    public static final String TYPE_TABLE = "TABLE";
    public static final String TYPE_CHART = "CHART";

    /** What a binding may be set to today. Everything else is refused. */
    public static boolean isImplemented(String binderType) {
        return TYPE_UNBOUND.equals(binderType)
                || TYPE_CORE.equals(binderType)
                || TYPE_LITERAL.equals(binderType)
                || TYPE_COMPUTED.equals(binderType);
    }

    /**
     * True when a computation has to produce this tag's value — the predicate
     * the prompt assembler asks for values by, and the one the P4 delivery gate
     * will check output keys against.
     *
     * <p>Written as a whitelist of the computed types rather than
     * "not CORE and not LITERAL" so that a binder type added later is excluded
     * until someone decides it belongs, instead of silently joining the list of
     * things the model is asked to return.
     */
    public static boolean isComputedType(String binderType) {
        return TYPE_COMPUTED.equals(binderType)
                || TYPE_VALUE.equals(binderType)
                || TYPE_NARRATIVE.equals(binderType)
                || TYPE_TABLE.equals(binderType)
                || TYPE_CHART.equals(binderType);
    }

    /** Instance form of {@link #isComputedType(String)}. */
    public boolean isComputed() {
        return isComputedType(binderType);
    }

    /** Named so the UI can list what is coming without hardcoding strings. */
    public static boolean isKnown(String binderType) {
        return isImplemented(binderType)
                || TYPE_VALUE.equals(binderType)
                || TYPE_NARRATIVE.equals(binderType)
                || TYPE_TABLE.equals(binderType)
                || TYPE_CHART.equals(binderType);
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportTagBindingId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportTemplateId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRtbTemplate"))
    private ReportTemplate template;

    /** The name between {@code ${} and {@code }} in the HTML. */
    @Column(name = "tag", nullable = false, length = 80)
    private String tag;

    @Column(name = "binderType", nullable = false, length = 16)
    private String binderType = TYPE_UNBOUND;

    /** CORE only: which fact. One of {@link ReportCoreFields#KEYS}. */
    @Column(name = "coreField", length = 40)
    private String coreField;

    /** LITERAL only: the fixed text. */
    @Column(name = "literalText", columnDefinition = "TEXT")
    private String literalText;

    /** Optional display format, e.g. a date pattern. NULL = as-is. */
    @Column(name = "format", length = 40)
    private String format;

    /**
     * Printed when the resolved value is null. NULL here means print nothing,
     * which is deliberately different from printing the word "null".
     */
    @Column(name = "fallbackText", length = 255)
    private String fallbackText;

    /** The practitioner's note. From P4 this is also the per-tag prompt. */
    @Column(name = "authorNote", columnDefinition = "TEXT")
    private String authorNote;

    /** Document order of the tag's first occurrence. */
    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    /** True once somebody has actually answered this tag. */
    public boolean isBound() {
        return !TYPE_UNBOUND.equals(binderType);
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportTagBindingId() {
        return reportTagBindingId;
    }

    public void setReportTagBindingId(Long reportTagBindingId) {
        this.reportTagBindingId = reportTagBindingId;
    }

    public ReportTemplate getTemplate() {
        return template;
    }

    public void setTemplate(ReportTemplate template) {
        this.template = template;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }

    public String getBinderType() {
        return binderType;
    }

    public void setBinderType(String binderType) {
        this.binderType = binderType;
    }

    public String getCoreField() {
        return coreField;
    }

    public void setCoreField(String coreField) {
        this.coreField = coreField;
    }

    public String getLiteralText() {
        return literalText;
    }

    public void setLiteralText(String literalText) {
        this.literalText = literalText;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    public String getFallbackText() {
        return fallbackText;
    }

    public void setFallbackText(String fallbackText) {
        this.fallbackText = fallbackText;
    }

    public String getAuthorNote() {
        return authorNote;
    }

    public void setAuthorNote(String authorNote) {
        this.authorNote = authorNote;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
