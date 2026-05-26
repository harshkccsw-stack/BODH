package com.bodhpsychometric.bodhassess.model;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.ManyToOne;
import javax.persistence.Table;
import javax.persistence.UniqueConstraint;

/**
 * One (field_key, value) row per demographic answer captured at session
 * start. Replaces portal_sessions.demographics JSON. Value is stored as
 * TEXT so it accepts any primitive shape the demographic field produced
 * (number, string, single-select choice).
 */
@Entity
@Table(name = "portal_session_demographics", uniqueConstraints = {
        @UniqueConstraint(name = "uniq_session_field",
                columnNames = {"session_id", "field_key"})
})
public class PortalSessionDemographic {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private PortalSession session;

    @Column(name = "field_key", nullable = false, length = 128)
    private String fieldKey;

    @Column(name = "value", columnDefinition = "text")
    private String value;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PortalSession getSession() { return session; }
    public void setSession(PortalSession session) { this.session = session; }
    public String getFieldKey() { return fieldKey; }
    public void setFieldKey(String fieldKey) { this.fieldKey = fieldKey; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
