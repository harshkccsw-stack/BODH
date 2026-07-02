package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.Map;

/**
 * Request bodies for workbook/sheet/column/share mutations, grouped as static
 * nested classes to keep the payload package tidy. All are plain mutable POJOs
 * for Jackson binding.
 */
public final class WorkbookRequests {

    private WorkbookRequests() {}

    public static class CreateWorkbook {
        private String name;
        private String description;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
    }

    public static class CreateSheet {
        private String name;
        private String sourceView;
        private Map<String, Object> sourceFilters;
        private String grain;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getSourceView() { return sourceView; }
        public void setSourceView(String sourceView) { this.sourceView = sourceView; }
        public Map<String, Object> getSourceFilters() { return sourceFilters; }
        public void setSourceFilters(Map<String, Object> sourceFilters) { this.sourceFilters = sourceFilters; }
        public String getGrain() { return grain; }
        public void setGrain(String grain) { this.grain = grain; }
    }

    public static class UpdateSheet {
        private String name;
        private Map<String, Object> sourceFilters;
        private Map<String, Object> displayState;
        private Integer sortOrder;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public Map<String, Object> getSourceFilters() { return sourceFilters; }
        public void setSourceFilters(Map<String, Object> sourceFilters) { this.sourceFilters = sourceFilters; }
        public Map<String, Object> getDisplayState() { return displayState; }
        public void setDisplayState(Map<String, Object> displayState) { this.displayState = displayState; }
        public Integer getSortOrder() { return sortOrder; }
        public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    }

    /** Create or update a derived column. {@code colKey} optional on create (derived from label). */
    public static class SaveColumn {
        private String colKey;
        private String label;
        private String expr;
        private String evalTarget;   // optional override; otherwise inferred
        private String format;
        public String getColKey() { return colKey; }
        public void setColKey(String colKey) { this.colKey = colKey; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public String getExpr() { return expr; }
        public void setExpr(String expr) { this.expr = expr; }
        public String getEvalTarget() { return evalTarget; }
        public void setEvalTarget(String evalTarget) { this.evalTarget = evalTarget; }
        public String getFormat() { return format; }
        public void setFormat(String format) { this.format = format; }
    }

    public static class ValidateExpr {
        private String expr;
        public String getExpr() { return expr; }
        public void setExpr(String expr) { this.expr = expr; }
    }

    public static class ShareWorkbook {
        private String sharedWithUserId;
        private String role;
        public String getSharedWithUserId() { return sharedWithUserId; }
        public void setSharedWithUserId(String sharedWithUserId) { this.sharedWithUserId = sharedWithUserId; }
        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
    }
}
