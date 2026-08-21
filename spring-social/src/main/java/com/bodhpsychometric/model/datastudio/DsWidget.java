package com.bodhpsychometric.model.datastudio;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * One tile on a dashboard. {@code type} is CHART | KPI | TABLE | PIVOT | TEXT
 * and {@code config} is the type-specific JSON the frontend both writes and
 * reads — chart kind, dimension, measures and their aggregates, filters, the
 * TEXT body. The backend does not parse it; it turns into an analytics query
 * in the browser, which then comes back through {@code /query}.
 *
 * <p>{@code sheet} is the data binding and is nullable, because a TEXT tile
 * binds to nothing. It is a plain reference, NOT composition: a sheet is a
 * shared thing that outlives any tile pointing at it, so nothing cascades
 * along it and deleting a bound sheet is refused rather than allowed to
 * silently blank the dashboards built on it.
 *
 * <p>Placement is a 12-column grid: {@code w} is the span, {@code sortOrder}
 * the flow position. {@code posX}/{@code posY}/{@code h} are stored for a
 * free-form canvas that the current UI does not use yet.
 */
@Entity
@Table(name = "DsWidget")
public class DsWidget implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long dsWidgetId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "dsDashboardId", nullable = false,
            foreignKey = @ForeignKey(name = "fkDsWidgetDashboard"))
    private DsDashboard dashboard;

    @Column(name = "type", nullable = false, length = 16)
    private String type;

    /** Null for TEXT. Never cascaded — see the class note. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dsSheetId",
            foreignKey = @ForeignKey(name = "fkDsWidgetSheet"))
    private DsSheet sheet;

    @Column(name = "config", columnDefinition = "TEXT")
    private String config;

    // Spelled snake_case here, unlike every other column in the project, and
    // it has to be: Hibernate's camelCase→underscores strategy only splits a
    // capital that has a lowercase letter on BOTH sides, so a trailing one is
    // never split — "posX" becomes `posx`, not `pos_x`, and ddl-auto: validate
    // then refuses to boot against a table that spelled it the obvious way.
    // Any future `fooX` / `idB` style name has the same trap in it.
    @Column(name = "pos_x")
    private Integer posX;

    @Column(name = "pos_y")
    private Integer posY;

    @Column(name = "w")
    private Integer w;

    @Column(name = "h")
    private Integer h;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getDsWidgetId() {
        return dsWidgetId;
    }

    public void setDsWidgetId(Long dsWidgetId) {
        this.dsWidgetId = dsWidgetId;
    }

    public DsDashboard getDashboard() {
        return dashboard;
    }

    public void setDashboard(DsDashboard dashboard) {
        this.dashboard = dashboard;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public DsSheet getSheet() {
        return sheet;
    }

    public void setSheet(DsSheet sheet) {
        this.sheet = sheet;
    }

    public String getConfig() {
        return config;
    }

    public void setConfig(String config) {
        this.config = config;
    }

    public Integer getPosX() {
        return posX;
    }

    public void setPosX(Integer posX) {
        this.posX = posX;
    }

    public Integer getPosY() {
        return posY;
    }

    public void setPosY(Integer posY) {
        this.posY = posY;
    }

    public Integer getW() {
        return w;
    }

    public void setW(Integer w) {
        this.w = w;
    }

    public Integer getH() {
        return h;
    }

    public void setH(Integer h) {
        this.h = h;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
