package com.bodhpsychometric.bodhassess.payload;

import java.util.Map;

public class ItemDisplayDtos {

    public static class ItemDisplayRow {
        private String itemId;
        private Map<String, Object> override;
        private boolean deleted;

        public String getItemId() { return itemId; }
        public void setItemId(String itemId) { this.itemId = itemId; }
        public Map<String, Object> getOverride() { return override; }
        public void setOverride(Map<String, Object> override) { this.override = override; }
        public boolean isDeleted() { return deleted; }
        public void setDeleted(boolean deleted) { this.deleted = deleted; }
    }

    public static class UpsertOverrideRequest {
        private String itemId;
        private Map<String, Object> override;

        public String getItemId() { return itemId; }
        public void setItemId(String itemId) { this.itemId = itemId; }
        public Map<String, Object> getOverride() { return override; }
        public void setOverride(Map<String, Object> override) { this.override = override; }
    }
}
