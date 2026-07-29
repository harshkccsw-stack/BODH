package com.bodhpsychometric.bodhassess.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

/**
 * Per-item flag for the questionnaire builder ("deleted" tombstone). Used
 * to be paired with an opaque `override` JSON map — that field was never
 * populated in production and has been removed; the service exposes a
 * pass-through empty map for callers that still send overrides.
 */
@Entity
@Table(name = "item_display_state")
public class ItemDisplayState {

    @Id
    @Column(name = "item_id")
    private String itemId;

    private boolean deleted;

    public String getItemId() { return itemId; }
    public void setItemId(String itemId) { this.itemId = itemId; }
    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
}
