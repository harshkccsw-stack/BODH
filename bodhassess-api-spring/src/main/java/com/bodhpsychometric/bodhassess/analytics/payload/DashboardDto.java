package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** A dashboard with its widgets and layout metadata. */
public class DashboardDto {
    private Long id;
    private Long workbookId;
    private String name;
    private Map<String, Object> layout = new LinkedHashMap<>();
    private Integer sortOrder;
    private List<WidgetDto> widgets = new ArrayList<>();
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getWorkbookId() { return workbookId; }
    public void setWorkbookId(Long workbookId) { this.workbookId = workbookId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Map<String, Object> getLayout() { return layout; }
    public void setLayout(Map<String, Object> layout) { this.layout = layout; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public List<WidgetDto> getWidgets() { return widgets; }
    public void setWidgets(List<WidgetDto> widgets) { this.widgets = widgets; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
