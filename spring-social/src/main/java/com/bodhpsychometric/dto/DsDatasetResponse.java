package com.bodhpsychometric.dto;

import java.util.List;
import java.util.Map;

/**
 * The self-describing grid envelope every Data Studio read returns — the raw
 * dataset, a sheet's computed rows, and an aggregation result all come back in
 * this one shape, so the frontend has a single renderer for all three.
 *
 * <p>Columns are declared by the backend, which is the whole point: an
 * assessment measuring six new traits gains six columns with no frontend
 * change. Each row is a flat map keyed by column key, plus {@code rowId} (the
 * allotment id) so a row can be traced back to the attempt behind it.
 */
public record DsDatasetResponse(
        String view,
        List<Column> columns,
        List<Map<String, Object>> rows,
        int rowCount) {

    public DsDatasetResponse(String view, List<Column> columns, List<Map<String, Object>> rows) {
        this(view, columns, rows, rows == null ? 0 : rows.size());
    }

    /**
     * One column header.
     *
     * <p>{@code key} is the formula-visible identity and carries its family as
     * a prefix — {@code core:}, {@code demo:}, {@code ans:}, {@code mqt:}
     * (a trait's own score), {@code mqtt:} (that trait plus its whole subtree),
     * {@code mq:} (a measured quality's total) and {@code calc:} (a computed
     * column). The prefix is what keeps keys unique across families: a
     * demographic field and an MQT can both be called "Age".
     *
     * <p>{@code group} drives grouping in the grid header: core | demographics
     * | answers | scores | derived | dimension | measure.
     */
    public record Column(String key, String label, String type, String group, List<String> options) {

        public Column(String key, String label, String type, String group) {
            this(key, label, type, group, null);
        }
    }
}
