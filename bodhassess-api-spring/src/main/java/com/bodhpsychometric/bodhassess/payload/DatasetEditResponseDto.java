package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Result of a batch cell-edit. {@code rows} holds the freshly-rebuilt rows for
 * every row that changed (with new {@code _updatedAt}), so the grid can repaint
 * authoritative values; {@code errors} lists rejected edits (validation +
 * concurrency conflicts).
 */
public class DatasetEditResponseDto {
    private int applied;
    private List<Map<String, Object>> rows = new ArrayList<>();
    private List<CellEditErrorDto> errors = new ArrayList<>();

    public int getApplied() { return applied; }
    public void setApplied(int applied) { this.applied = applied; }

    public List<Map<String, Object>> getRows() { return rows; }
    public void setRows(List<Map<String, Object>> rows) { this.rows = rows; }

    public List<CellEditErrorDto> getErrors() { return errors; }
    public void setErrors(List<CellEditErrorDto> errors) { this.errors = errors; }
}
