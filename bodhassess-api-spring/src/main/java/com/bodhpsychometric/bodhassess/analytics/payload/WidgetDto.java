package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.LinkedHashMap;
import java.util.Map;

/** One widget on a dashboard. {@code config} is type-specific (see DsWidget). */
public class WidgetDto {
    private Long id;
    private Long dashboardId;
    private String type;            // CHART | KPI | TABLE | PIVOT | TEXT
    private Long sheetId;
    private Map<String, Object> config = new LinkedHashMap<>();
    private Integer posX;
    private Integer posY;
    private Integer w;
    private Integer h;
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getDashboardId() { return dashboardId; }
    public void setDashboardId(Long dashboardId) { this.dashboardId = dashboardId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Long getSheetId() { return sheetId; }
    public void setSheetId(Long sheetId) { this.sheetId = sheetId; }
    public Map<String, Object> getConfig() { return config; }
    public void setConfig(Map<String, Object> config) { this.config = config; }
    public Integer getPosX() { return posX; }
    public void setPosX(Integer posX) { this.posX = posX; }
    public Integer getPosY() { return posY; }
    public void setPosY(Integer posY) { this.posY = posY; }
    public Integer getW() { return w; }
    public void setW(Integer w) { this.w = w; }
    public Integer getH() { return h; }
    public void setH(Integer h) { this.h = h; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}
