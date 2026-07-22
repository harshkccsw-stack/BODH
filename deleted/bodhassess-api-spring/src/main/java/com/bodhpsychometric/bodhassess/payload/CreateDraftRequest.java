package com.bodhpsychometric.bodhassess.payload;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Body posted to /questionnaires/{id}/versions/drafts.
 *
 *   - branchedFromVersionId = null  → blank draft (fresh content)
 *   - branchedFromVersionId = <vid> → clone of that committed version
 *
 * The optional initialName lets the admin label the in-flight draft
 * (purely for the drafts-list UI) before they commit it.
 */
public class CreateDraftRequest {
    @JsonProperty("branchedFromVersionId")
    private String branchedFromVersionId;
    @JsonProperty("initialName")
    private String initialName;

    public String getBranchedFromVersionId() { return branchedFromVersionId; }
    public void setBranchedFromVersionId(String branchedFromVersionId) { this.branchedFromVersionId = branchedFromVersionId; }
    public String getInitialName() { return initialName; }
    public void setInitialName(String initialName) { this.initialName = initialName; }
}
