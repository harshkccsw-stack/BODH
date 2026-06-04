package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.List;
import java.util.Map;

/**
 * A grouped aggregation over a dataset view. {@code dimensions} are column keys
 * to GROUP BY; {@code measures} are aggregates of an expression per group;
 * {@code filters} prune rows before grouping. With no dimensions the whole
 * (filtered) population forms a single group — i.e. a KPI. Powers KPI tiles,
 * pivot tables, and charts.
 */
public class AnalyticsQueryRequest {

    private String sourceView;
    private Map<String, Object> sourceFilters;
    private List<String> dimensions;
    private List<Measure> measures;
    private List<Filter> filters;
    private Integer limit;

    public String getSourceView() { return sourceView; }
    public void setSourceView(String sourceView) { this.sourceView = sourceView; }
    public Map<String, Object> getSourceFilters() { return sourceFilters; }
    public void setSourceFilters(Map<String, Object> sourceFilters) { this.sourceFilters = sourceFilters; }
    public List<String> getDimensions() { return dimensions; }
    public void setDimensions(List<String> dimensions) { this.dimensions = dimensions; }
    public List<Measure> getMeasures() { return measures; }
    public void setMeasures(List<Measure> measures) { this.measures = measures; }
    public List<Filter> getFilters() { return filters; }
    public void setFilters(List<Filter> filters) { this.filters = filters; }
    public Integer getLimit() { return limit; }
    public void setLimit(Integer limit) { this.limit = limit; }

    /** An aggregate of {@code expr} per group: agg ∈ sum|avg|count|min|max|p25|p50|p75|median. */
    public static class Measure {
        private String expr;
        private String agg;
        private String label;
        public String getExpr() { return expr; }
        public void setExpr(String expr) { this.expr = expr; }
        public String getAgg() { return agg; }
        public void setAgg(String agg) { this.agg = agg; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
    }

    /** A row predicate: {@code colKey op value}, op ∈ = != < <= > >= contains. */
    public static class Filter {
        private String colKey;
        private String op;
        private Object value;
        public String getColKey() { return colKey; }
        public void setColKey(String colKey) { this.colKey = colKey; }
        public String getOp() { return op; }
        public void setOp(String op) { this.op = op; }
        public Object getValue() { return value; }
        public void setValue(Object value) { this.value = value; }
    }
}
