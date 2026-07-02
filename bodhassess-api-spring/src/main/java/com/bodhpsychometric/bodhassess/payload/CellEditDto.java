package com.bodhpsychometric.bodhassess.payload;

/**
 * One cell edit submitted from the data grid. {@code rowUpdatedAt} is the
 * {@code _updatedAt} the client last saw for the row; the server uses it for
 * optimistic concurrency (reject if the row changed since it was loaded).
 */
public class CellEditDto {
    private String rowId;
    private String columnKey;
    private Object oldValue;
    private Object newValue;
    private String rowUpdatedAt;

    public String getRowId() { return rowId; }
    public void setRowId(String rowId) { this.rowId = rowId; }

    public String getColumnKey() { return columnKey; }
    public void setColumnKey(String columnKey) { this.columnKey = columnKey; }

    public Object getOldValue() { return oldValue; }
    public void setOldValue(Object oldValue) { this.oldValue = oldValue; }

    public Object getNewValue() { return newValue; }
    public void setNewValue(Object newValue) { this.newValue = newValue; }

    public String getRowUpdatedAt() { return rowUpdatedAt; }
    public void setRowUpdatedAt(String rowUpdatedAt) { this.rowUpdatedAt = rowUpdatedAt; }
}
