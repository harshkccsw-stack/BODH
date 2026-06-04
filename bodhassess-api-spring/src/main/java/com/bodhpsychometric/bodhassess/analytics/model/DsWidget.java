package com.bodhpsychometric.bodhassess.analytics.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.Index;
import javax.persistence.Table;

/**
 * One widget on a dashboard. {@code type} = CHART | KPI | TABLE | PIVOT | TEXT.
 * {@code config} is type-specific JSON (chart kind, dimensions, measures,
 * filters, KPI expr/agg, etc.). {@code sheetId} is the optional data binding.
 * Grid placement: {@code w} is a 12-column span; widgets flow in {@code sortOrder}.
 */
@Entity
@Table(name = "ds_widget", indexes = @Index(name = "idx_ds_widget_dashboard", columnList = "dashboard_id"))
public class DsWidget {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "dashboard_id", nullable = false)
    private Long dashboardId;

    @Column(nullable = false, length = 16)
    private String type;

    @Column(name = "sheet_id")
    private Long sheetId;

    @Column(name = "config", columnDefinition = "text")
    private String config;

    @Column(name = "pos_x")
    private Integer posX;

    @Column(name = "pos_y")
    private Integer posY;

    @Column(name = "w")
    private Integer w;

    @Column(name = "h")
    private Integer h;

    @Column(name = "sort_order")
    private Integer sortOrder;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getDashboardId() { return dashboardId; }
    public void setDashboardId(Long dashboardId) { this.dashboardId = dashboardId; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Long getSheetId() { return sheetId; }
    public void setSheetId(Long sheetId) { this.sheetId = sheetId; }
    public String getConfig() { return config; }
    public void setConfig(String config) { this.config = config; }
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
