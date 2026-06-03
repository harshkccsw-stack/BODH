package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A sheet definition: a bound dataset view + filters + derived columns +
 * display state. Does NOT carry live data rows — those come from
 * {@code GET /sheets/{id}/data} in Phase 2.
 */
public class SheetDto {
    private Long id;
    private Long workbookId;
    private String name;
    private String sourceView;
    private Map<String, Object> sourceFilters = new LinkedHashMap<>();
    private String grain;
    private Map<String, Object> displayState = new LinkedHashMap<>();
    private Integer sortOrder;
    private List<DerivedColumnDto> derivedColumns = new ArrayList<>();
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getWorkbookId() { return workbookId; }
    public void setWorkbookId(Long workbookId) { this.workbookId = workbookId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSourceView() { return sourceView; }
    public void setSourceView(String sourceView) { this.sourceView = sourceView; }
    public Map<String, Object> getSourceFilters() { return sourceFilters; }
    public void setSourceFilters(Map<String, Object> sourceFilters) { this.sourceFilters = sourceFilters; }
    public String getGrain() { return grain; }
    public void setGrain(String grain) { this.grain = grain; }
    public Map<String, Object> getDisplayState() { return displayState; }
    public void setDisplayState(Map<String, Object> displayState) { this.displayState = displayState; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public List<DerivedColumnDto> getDerivedColumns() { return derivedColumns; }
    public void setDerivedColumns(List<DerivedColumnDto> derivedColumns) { this.derivedColumns = derivedColumns; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
