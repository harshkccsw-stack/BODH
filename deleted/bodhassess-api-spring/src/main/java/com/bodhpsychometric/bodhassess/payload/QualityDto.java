package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

public class QualityDto {
    private String id;
    private String name;
    private String description;
    private List<MqtDto> mqts = new ArrayList<>();

    public static class MqtDto {
        private String id;
        private String name;
        // Recursive children — null/absent on flat MQTs.
        private List<MqtDto> children;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public List<MqtDto> getChildren() { return children; }
        public void setChildren(List<MqtDto> children) { this.children = children; }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<MqtDto> getMqts() { return mqts; }
    public void setMqts(List<MqtDto> mqts) { this.mqts = mqts; }
}
