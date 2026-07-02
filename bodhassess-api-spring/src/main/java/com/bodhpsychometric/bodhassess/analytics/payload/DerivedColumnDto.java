package com.bodhpsychometric.bodhassess.analytics.payload;

/** A user-defined computed column on a sheet. */
public class DerivedColumnDto {
    private Long id;
    private String colKey;
    private String label;
    private String expr;
    private String evalTarget;   // "CLIENT" | "SERVER"
    private String resultType;   // "number" | "string" | "boolean" | "datetime"
    private String format;
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
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
