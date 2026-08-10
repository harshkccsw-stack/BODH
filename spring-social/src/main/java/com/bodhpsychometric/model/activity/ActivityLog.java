package com.bodhpsychometric.model.activity;

import java.time.OffsetDateTime;

import com.bodhpsychometric.model.activity.enums.ActivityOutcome;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * One answered HTTP request. Written after the response has been sent, from a
 * background thread, in its own transaction — a failure to record activity
 * must never fail or slow the request it describes.
 *
 * Every request is recorded, reads included. The row is deliberately narrow:
 * no bodies, no headers beyond the user agent, nothing that would need
 * redacting. What is NOT here is as deliberate as what is — dob, tokens,
 * answers and demographic values never reach this table.
 *
 * The actor columns are a SNAPSHOT and carry no foreign key: an audit row has
 * to outlive the account it describes, since "who deleted this" is exactly
 * the question asked after someone is gone.
 */
@Entity
@Table(name = "ActivityLog",
        indexes = {
                @Index(name = "idxAlOccurredAt", columnList = "occurredAt"),
                @Index(name = "idxAlActor", columnList = "actorUserId, occurredAt"),
                @Index(name = "idxAlStatus", columnList = "httpStatus, occurredAt")
        })
public class ActivityLog implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long activityLogId;

    /** Ties the row to the log lines of the same request. */
    @Column(name = "requestId", length = 64)
    private String requestId;

    @Column(name = "occurredAt", nullable = false)
    private OffsetDateTime occurredAt;

    /** Null for anonymous — which is a normal state while require-auth is off. */
    @Column(name = "actorUserId")
    private Long actorUserId;

    @Column(name = "actorEmail", length = 255)
    private String actorEmail;

    @Column(name = "actorSuperAdmin", nullable = false)
    private boolean actorSuperAdmin;

    @Column(name = "method", nullable = false, length = 8)
    private String method;

    @Column(name = "path", nullable = false, length = 512)
    private String path;

    /** The matched mapping, so the viewer can group by endpoint, not by id. */
    @Column(name = "pathTemplate", length = 255)
    private String pathTemplate;

    @Column(name = "queryString", length = 1000)
    private String queryString;

    @Column(name = "httpStatus", nullable = false)
    private int httpStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, length = 16)
    private ActivityOutcome outcome;

    /** Message only; the stack trace stays in the application log. */
    @Column(name = "errorMessage", length = 500)
    private String errorMessage;

    @Column(name = "durationMs", nullable = false)
    private int durationMs;

    @Column(name = "ip", length = 45)
    private String ip;

    @Column(name = "userAgent", length = 255)
    private String userAgent;

    public Long getActivityLogId() {
        return activityLogId;
    }

    public void setActivityLogId(Long activityLogId) {
        this.activityLogId = activityLogId;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public OffsetDateTime getOccurredAt() {
        return occurredAt;
    }

    public void setOccurredAt(OffsetDateTime occurredAt) {
        this.occurredAt = occurredAt;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public void setActorUserId(Long actorUserId) {
        this.actorUserId = actorUserId;
    }

    public String getActorEmail() {
        return actorEmail;
    }

    public void setActorEmail(String actorEmail) {
        this.actorEmail = actorEmail;
    }

    public boolean isActorSuperAdmin() {
        return actorSuperAdmin;
    }

    public void setActorSuperAdmin(boolean actorSuperAdmin) {
        this.actorSuperAdmin = actorSuperAdmin;
    }

    public String getMethod() {
        return method;
    }

    public void setMethod(String method) {
        this.method = method;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String path) {
        this.path = path;
    }

    public String getPathTemplate() {
        return pathTemplate;
    }

    public void setPathTemplate(String pathTemplate) {
        this.pathTemplate = pathTemplate;
    }

    public String getQueryString() {
        return queryString;
    }

    public void setQueryString(String queryString) {
        this.queryString = queryString;
    }

    public int getHttpStatus() {
        return httpStatus;
    }

    public void setHttpStatus(int httpStatus) {
        this.httpStatus = httpStatus;
    }

    public ActivityOutcome getOutcome() {
        return outcome;
    }

    public void setOutcome(ActivityOutcome outcome) {
        this.outcome = outcome;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public int getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(int durationMs) {
        this.durationMs = durationMs;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }
}
