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
    public record Column(String key, String label, String type, String group, List<String> options,
            ScoreRef score) {

        public Column(String key, String label, String type, String group) {
            this(key, label, type, group, null, null);
        }

        public Column(String key, String label, String type, String group, List<String> options) {
            this(key, label, type, group, options, null);
        }
    }

    /**
     * Where a score column sits in the MQ/MQT taxonomy — structure the label
     * used to be the only carrier of.
     *
     * <p>{@code label} is a full path ("Fundamental Skillset &rsaquo; Cognitive
     * check &rsaquo; Verbal"), which is unambiguous and unreadable in a narrow
     * picker: truncation eats the tail, and the tail is the only part that
     * distinguishes two columns. Worse, an own score and its subtree total
     * differ ONLY by a suffix, so they truncate to the same string and picking
     * the wrong one produces a quietly wrong report rather than an error.
     *
     * <p>So the distinctions are carried as fields instead of baked into a
     * string a renderer has to parse back out. {@code label} is deliberately
     * unchanged — export sheets, Data Studio headers and the AI column catalog
     * all read it, and this is a presentation fix, not a rename.
     *
     * @param role      {@code own} (an MQT's own score), {@code subtree} (that
     *                  MQT plus its descendants) or {@code mqTotal}
     * @param depth     0 for an MQ root MQT, +1 per level; 0 for an MQ total
     * @param nodeName  the node's OWN name, without its ancestors
     * @param mqId      the measured quality this column belongs to
     * @param mqName    that quality's name — the root a tree renders under
     * @param parentKey the {@code mqt:} key of the parent MQT, or null at the
     *                  top of an MQ. Every ancestor of a scored node is itself
     *                  a column, so this never dangles.
     */
    public record ScoreRef(String role, int depth, String nodeName, Long mqId, String mqName,
            String parentKey) {
    }
}
