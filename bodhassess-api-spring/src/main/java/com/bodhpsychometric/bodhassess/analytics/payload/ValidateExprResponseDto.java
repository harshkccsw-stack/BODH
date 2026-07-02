package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.ArrayList;
import java.util.List;

/**
 * Result of validating a formula against a sheet's live column set. {@code ok}
 * is true only when the expression parses and every referenced column exists.
 * {@code evalTarget} is the inferred CLIENT/SERVER classification.
 */
public class ValidateExprResponseDto {
    private boolean ok;
    private String evalTarget;          // "CLIENT" | "SERVER"
    private String resultType;          // "number" | "string" | "boolean" | "datetime"
    private List<String> errors = new ArrayList<>();
    private List<String> referencedColumns = new ArrayList<>();
    private List<String> functions = new ArrayList<>();

    public boolean isOk() { return ok; }
    public void setOk(boolean ok) { this.ok = ok; }
    public String getEvalTarget() { return evalTarget; }
    public void setEvalTarget(String evalTarget) { this.evalTarget = evalTarget; }
    public String getResultType() { return resultType; }
    public void setResultType(String resultType) { this.resultType = resultType; }
    public List<String> getErrors() { return errors; }
    public void setErrors(List<String> errors) { this.errors = errors; }
    public List<String> getReferencedColumns() { return referencedColumns; }
    public void setReferencedColumns(List<String> referencedColumns) { this.referencedColumns = referencedColumns; }
    public List<String> getFunctions() { return functions; }
    public void setFunctions(List<String> functions) { this.functions = functions; }
}
