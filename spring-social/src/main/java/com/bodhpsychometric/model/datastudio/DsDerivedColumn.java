package com.bodhpsychometric.model.datastudio;

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
import jakarta.persistence.UniqueConstraint;

/**
 * A user-defined computed column on a sheet — the spreadsheet half of Data
 * Studio. {@code expr} is formula SOURCE in the closed whitelisted grammar
 * (see {@code ExpressionService}); it is never SQL and is never evaluated as
 * code.
 *
 * <p>{@code colKey} is the stable identity — {@code calc:wellbeing_index}.
 * Other formulas reference it by that key, so it is generated once from the
 * label and then never changes, even when the label is edited. That is why
 * the unique key is on (sheet, colKey) and the label carries no constraint.
 *
 * <p>{@code evalTarget} records WHERE the formula runs. Row-local arithmetic
 * is CLIENT (the browser can compute it from the rows it already holds);
 * anything using a population function — ZSCORE, PERCENTILE, RANK — is SERVER,
 * because it needs every row and the browser is not guaranteed to have them.
 * The value is inferred from the function set on save and may be overridden.
 * It is a hint about latency, not about correctness: {@code GET .../getData}
 * computes EVERY column server-side regardless, so the numbers a sheet shows
 * always come from the full population.
 */
@Entity
@Table(name = "DsDerivedColumn",
        uniqueConstraints = @UniqueConstraint(name = "uqDsColSheetKey",
                columnNames = {"dsSheetId", "colKey"}))
public class DsDerivedColumn implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    public static final String CLIENT = "CLIENT";
    public static final String SERVER = "SERVER";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dsDerivedColumnId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dsSheetId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsColSheet"))
    private DsSheet sheet;

    /** Stable id used in row maps and in other formulas, e.g. "calc:z_anxiety". */
    @Column(name = "colKey", nullable = false, length = 80)
    private String colKey;

    @Column(name = "label", nullable = false, length = 160)
    private String label;

    @Column(name = "expr", nullable = false, columnDefinition = "TEXT")
    private String expr;

    @Column(name = "evalTarget", nullable = false, length = 8)
    private String evalTarget = CLIENT;

    /** "number" | "string" | "boolean". */
    @Column(name = "resultType", nullable = false, length = 16)
    private String resultType = "number";

    /** Display format hint for the grid, e.g. "0.00" or "pct". Opaque here. */
    @Column(name = "format", length = 40)
    private String format;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getDsDerivedColumnId() {
        return dsDerivedColumnId;
    }

    public void setDsDerivedColumnId(Long dsDerivedColumnId) {
        this.dsDerivedColumnId = dsDerivedColumnId;
    }

    public DsSheet getSheet() {
        return sheet;
    }

    public void setSheet(DsSheet sheet) {
        this.sheet = sheet;
    }

    public String getColKey() {
        return colKey;
    }

    public void setColKey(String colKey) {
        this.colKey = colKey;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getExpr() {
        return expr;
    }

    public void setExpr(String expr) {
        this.expr = expr;
    }

    public String getEvalTarget() {
        return evalTarget;
    }

    public void setEvalTarget(String evalTarget) {
        this.evalTarget = evalTarget;
    }

    public String getResultType() {
        return resultType;
    }

    public void setResultType(String resultType) {
        this.resultType = resultType;
    }

    public String getFormat() {
        return format;
    }

    public void setFormat(String format) {
        this.format = format;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
