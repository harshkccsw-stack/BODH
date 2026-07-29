package com.bodhpsychometric.bodhassess.analytics.payload;

/** A co-ownership grant on a workbook. */
public class WorkbookShareDto {
    private Long id;
    private String sharedWithUserId;
    private String role;        // "EDITOR" | "VIEWER"
    private String grantedBy;
    private String createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSharedWithUserId() { return sharedWithUserId; }
    public void setSharedWithUserId(String sharedWithUserId) { this.sharedWithUserId = sharedWithUserId; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getGrantedBy() { return grantedBy; }
    public void setGrantedBy(String grantedBy) { this.grantedBy = grantedBy; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
