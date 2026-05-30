package com.bodhpsychometric.bodhassess.payload;

/**
 * A single rejected cell edit. When {@code conflict} is true the edit was
 * refused by optimistic concurrency and {@code currentUpdatedAt} carries the
 * server's current row timestamp so the client can reconcile.
 */
public class CellEditErrorDto {
    private String rowId;
    private String columnKey;
    private String message;
    private boolean conflict;
    private String currentUpdatedAt;

    public CellEditErrorDto() {}

    public CellEditErrorDto(String rowId, String columnKey, String message) {
        this.rowId = rowId;
        this.columnKey = columnKey;
        this.message = message;
    }

    public String getRowId() { return rowId; }
    public void setRowId(String rowId) { this.rowId = rowId; }

    public String getColumnKey() { return columnKey; }
    public void setColumnKey(String columnKey) { this.columnKey = columnKey; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public boolean isConflict() { return conflict; }
    public void setConflict(boolean conflict) { this.conflict = conflict; }

    public String getCurrentUpdatedAt() { return currentUpdatedAt; }
    public void setCurrentUpdatedAt(String currentUpdatedAt) { this.currentUpdatedAt = currentUpdatedAt; }
}
