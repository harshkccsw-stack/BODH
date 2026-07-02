package com.bodhpsychometric.bodhassess.payload;

import java.util.List;
import java.util.Map;

/**
 * Envelope for a data-grid "view". Columns are self-describing (see
 * {@link DatasetColumnDto}); each row is a flat map keyed by column key plus
 * the meta keys "rowId" and "_updatedAt" used for edit targeting and
 * optimistic concurrency in later phases.
 */
public class DatasetResponseDto {
    private String view;                  // "sessions" | "respondents" | "answers"
    private List<DatasetColumnDto> columns;
    private List<Map<String, Object>> rows;
    private int rowCount;

    public DatasetResponseDto() {}

    public DatasetResponseDto(String view, List<DatasetColumnDto> columns, List<Map<String, Object>> rows) {
        this.view = view;
        this.columns = columns;
        this.rows = rows;
        this.rowCount = rows == null ? 0 : rows.size();
    }

    public String getView() { return view; }
    public void setView(String view) { this.view = view; }

    public List<DatasetColumnDto> getColumns() { return columns; }
    public void setColumns(List<DatasetColumnDto> columns) { this.columns = columns; }

    public List<Map<String, Object>> getRows() { return rows; }
    public void setRows(List<Map<String, Object>> rows) {
        this.rows = rows;
        this.rowCount = rows == null ? 0 : rows.size();
    }

    public int getRowCount() { return rowCount; }
    public void setRowCount(int rowCount) { this.rowCount = rowCount; }
}
