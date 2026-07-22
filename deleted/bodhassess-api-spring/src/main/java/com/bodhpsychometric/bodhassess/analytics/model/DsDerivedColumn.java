package com.bodhpsychometric.bodhassess.analytics.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Index;
import javax.persistence.Table;
import javax.persistence.UniqueConstraint;

/**
 * A user-defined computed column on a sheet — the heart of the spreadsheet
 * feature. {@code expr} is the formula source; {@code evalTarget} records where
 * it runs (CLIENT = browser/HyperFormula for row-local math, SERVER = compiled
 * to SQL for population/cohort math). The formula language is a closed,
 * whitelisted grammar (see ExpressionService) — never raw SQL.
 */
@Entity
@Table(name = "ds_derived_column",
        uniqueConstraints = @UniqueConstraint(name = "uniq_ds_col_sheet_key",
                columnNames = {"sheet_id", "col_key"}),
        indexes = @Index(name = "idx_ds_col_sheet", columnList = "sheet_id"))
public class DsDerivedColumn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sheet_id", nullable = false)
    private Long sheetId;

    /** Stable column id used in row maps and other formulas, e.g. "calc:wellbeing_index". */
    @Column(name = "col_key", nullable = false, length = 80)
    private String colKey;

    @Column(nullable = false, length = 160)
    private String label;

    @Column(nullable = false, columnDefinition = "text")
    private String expr;

    /** "CLIENT" | "SERVER" — inferred from the function set, overridable. */
    @Column(name = "eval_target", nullable = false, length = 8)
    private String evalTarget;

    /** "number" | "string" | "boolean" | "datetime". */
    @Column(name = "result_type", nullable = false, length = 16)
    private String resultType;

    @Column(length = 40)
    private String format;

    @Column(name = "sort_order")
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSheetId() { return sheetId; }
    public void setSheetId(Long sheetId) { this.sheetId = sheetId; }
    public String getColKey() { return colKey; }
    public void setColKey(String colKey) { this.colKey = colKey; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public String getExpr() { return expr; }
    public void setExpr(String expr) { this.expr = expr; }
    public String getEvalTarget() { return evalTarget; }
    public void setEvalTarget(String evalTarget) { this.evalTarget = evalTarget; }
    public String getResultType() { return resultType; }
    public void setResultType(String resultType) { this.resultType = resultType; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
