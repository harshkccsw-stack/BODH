package com.bodhpsychometric.bodhassess.payload;

import java.util.List;

/**
 * Self-describing column metadata for the data-grid. The frontend renders
 * whatever columns the backend declares, so dynamic score / demographic
 * columns require no UI changes.
 */
public class DatasetColumnDto {
    private String key;          // stable column id, e.g. "respondentName", "mqt:OPENNESS", "demo:age"
    private String label;        // human label shown in the header
    private String type;         // "string" | "number" | "datetime" | "enum"
    private String group;        // "core" | "scores" | "demographics" — drives column grouping
    private String editable;     // "none" | "field" | "answer" | "override" (read-only grid uses "none")
    private List<String> options; // allowed values when type == "enum", else null

    public DatasetColumnDto() {}

    public DatasetColumnDto(String key, String label, String type, String group) {
        this.key = key;
        this.label = label;
        this.type = type;
        this.group = group;
        this.editable = "none";
    }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getGroup() { return group; }
    public void setGroup(String group) { this.group = group; }

    public String getEditable() { return editable; }
    public void setEditable(String editable) { this.editable = editable; }

    public List<String> getOptions() { return options; }
    public void setOptions(List<String> options) { this.options = options; }
}
