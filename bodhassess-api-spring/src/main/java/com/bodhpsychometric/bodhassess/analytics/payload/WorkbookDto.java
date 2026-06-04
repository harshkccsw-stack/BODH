package com.bodhpsychometric.bodhassess.analytics.payload;

import java.util.ArrayList;
import java.util.List;

/**
 * A workbook plus, when fetched individually, its sheets and shares. The
 * {@code access} field tells the caller their own relationship to it
 * ("OWNER" | "EDITOR" | "VIEWER") so the UI can gate editing.
 */
public class WorkbookDto {
    private Long id;
    private String name;
    private String description;
    private String ownerId;
    private String access;          // caller's role: OWNER | EDITOR | VIEWER
    private List<SheetDto> sheets = new ArrayList<>();
    private List<WorkbookShareDto> shares = new ArrayList<>();
    private String createdAt;
    private String updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getOwnerId() { return ownerId; }
    public void setOwnerId(String ownerId) { this.ownerId = ownerId; }
    public String getAccess() { return access; }
    public void setAccess(String access) { this.access = access; }
    public List<SheetDto> getSheets() { return sheets; }
    public void setSheets(List<SheetDto> sheets) { this.sheets = sheets; }
    public List<WorkbookShareDto> getShares() { return shares; }
    public void setShares(List<WorkbookShareDto> shares) { this.shares = shares; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
