package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Body posted to /questionnaires/{id}/versions/{vid}/commit. Admin's
 * choice of bump:
 *   - "MAJOR" → next major, minor reset to 0  (v1.2 → v2.0)
 *   - "MINOR" → keep major, bump minor        (v1.2 → v1.3)
 *
 * Plus the human-facing name + comments captured on the row at commit
 * time.
 */
public class CommitVersionRequest {
    // "MAJOR" | "MINOR" — case-insensitive.
    @JsonProperty("bump")
    private String bump;
    @JsonProperty("versionName")
    private String versionName;
    @JsonProperty("versionComments")
    private String versionComments;
    // If true, the freshly-committed version also becomes the parent's
    // current pointer. Convenient default for the typical "edit + ship"
    // flow.
    @JsonProperty("setAsCurrent")
    private Boolean setAsCurrent;

    public String getBump() { return bump; }
    public void setBump(String bump) { this.bump = bump; }
    public String getVersionName() { return versionName; }
    public void setVersionName(String versionName) { this.versionName = versionName; }
    public String getVersionComments() { return versionComments; }
    public void setVersionComments(String versionComments) { this.versionComments = versionComments; }
    public Boolean getSetAsCurrent() { return setAsCurrent; }
    public void setSetAsCurrent(Boolean setAsCurrent) { this.setAsCurrent = setAsCurrent; }
}
