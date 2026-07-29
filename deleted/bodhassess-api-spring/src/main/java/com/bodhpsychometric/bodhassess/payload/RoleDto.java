package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class RoleDto {
    private String id;
    private String name;
    private String description;
    @JsonProperty("url_paths")
    private List<String> urlPaths = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<String> getUrlPaths() { return urlPaths; }
    public void setUrlPaths(List<String> urlPaths) { this.urlPaths = urlPaths; }
}
