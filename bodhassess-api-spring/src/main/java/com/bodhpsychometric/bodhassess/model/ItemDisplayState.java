package com.bodhpsychometric.bodhassess.model;

import java.util.HashMap;
import java.util.Map;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "item_display_state")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class ItemDisplayState {

    @Id
    @Column(name = "item_id")
    private String itemId;

    @Type(type = "json")
    @Column(name = "override", columnDefinition = "json")
    private Map<String, Object> override = new HashMap<>();

    private boolean deleted;

    public String getItemId() { return itemId; }
    public void setItemId(String itemId) { this.itemId = itemId; }
    public Map<String, Object> getOverride() { return override; }
    public void setOverride(Map<String, Object> override) { this.override = override; }
    public boolean isDeleted() { return deleted; }
    public void setDeleted(boolean deleted) { this.deleted = deleted; }
}
