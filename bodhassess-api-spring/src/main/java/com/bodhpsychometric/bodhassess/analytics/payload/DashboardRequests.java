package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.Map;

/** Request bodies for dashboard + widget mutations. */
public final class DashboardRequests {

    private DashboardRequests() {}

    public static class CreateDashboard {
        private String name;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
    }

    public static class UpdateDashboard {
        private String name;
        private Map<String, Object> layout;
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public Map<String, Object> getLayout() { return layout; }
        public void setLayout(Map<String, Object> layout) { this.layout = layout; }
    }

    /** Create or update a widget. Fields left null on update are unchanged. */
    public static class SaveWidget {
        private String type;
        private Long sheetId;
        private Map<String, Object> config;
        private Integer posX;
        private Integer posY;
        private Integer w;
        private Integer h;
        private Integer sortOrder;
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
}
