package com.bodhpsychometric.model.report;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * An HTML report layout with {@code ${tag}} placeholders.
 *
 * <p>The template is the deliverable a customer signs off on, and its tags are
 * the specification. On every save the HTML is re-parsed and the
 * {@link ReportTagBinding} rows are reconciled against what was found — new
 * tags appear unbound, vanished tags are dropped. That reconcile is the whole
 * authoring model: the screen is a checklist ("9 of 14 tags bound"), not a
 * form somebody has to guess field names for.
 *
 * <p>{@code tagsJson} is DERIVED — a JSON array of tag names in document
 * order, rewritten from the HTML on every save and never authored. It exists
 * so the library list can show a tag count without parsing every template's
 * HTML on every page load. Treat the bindings as the truth and this as a
 * cache of the parse.
 *
 * <p>Bindings cascade because they are true composition: a tag binding has no
 * meaning away from its template and no other row ever points at one. That is
 * the narrow case CLAUDE.md allows cascade for.
 */
@Entity
@Table(name = "ReportTemplate")
public class ReportTemplate implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    /** Editable. May have unbound tags. Not renderable for delivery. */
    public static final String STATUS_DRAFT = "DRAFT";

    /** Every tag bound and the lint passed. Renderable. */
    public static final String STATUS_PUBLISHED = "PUBLISHED";

    /** Retired. Kept because reports produced from it must stay explicable. */
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportTemplateId;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "description", length = 512)
    private String description;

    /**
     * The authored HTML. LONGTEXT, not TEXT: a two-page report carrying an
     * inline base64 logo and several inline SVG charts passes 64 KB easily,
     * and TEXT truncates it silently on a non-strict connection.
     */
    @Column(name = "html", columnDefinition = "LONGTEXT", nullable = false)
    private String html;

    /** JSON array of tag names, in document order. Derived from {@link #html}. */
    @Column(name = "tagsJson", columnDefinition = "TEXT")
    private String tagsJson;

    @Column(name = "status", nullable = false, length = 12)
    private String status = STATUS_DRAFT;

    @Column(name = "version", nullable = false)
    private int version = 1;

    /** Nullable scoping hint, not an FK. NULL = available to every org. */
    @Column(name = "organizationId")
    private Long organizationId;

    @Column(name = "createdByUserId")
    private Long createdByUserId;

    @Column(name = "createdAt", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updatedAt", nullable = false)
    private OffsetDateTime updatedAt;

    @OneToMany(mappedBy = "template", cascade = CascadeType.ALL,
            orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<ReportTagBinding> bindings = new ArrayList<>();

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    // ── sync helpers ──────────────────────────────────────────────────────

    public void addBinding(ReportTagBinding binding) {
        bindings.add(binding);
        binding.setTemplate(this);
    }

    public void removeBinding(ReportTagBinding binding) {
        bindings.remove(binding);
        binding.setTemplate(null);
    }

    // ── accessors ─────────────────────────────────────────────────────────

    public Long getReportTemplateId() {
        return reportTemplateId;
    }

    public void setReportTemplateId(Long reportTemplateId) {
        this.reportTemplateId = reportTemplateId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getHtml() {
        return html;
    }

    public void setHtml(String html) {
        this.html = html;
    }

    public String getTagsJson() {
        return tagsJson;
    }

    public void setTagsJson(String tagsJson) {
        this.tagsJson = tagsJson;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public Long getOrganizationId() {
        return organizationId;
    }

    public void setOrganizationId(Long organizationId) {
        this.organizationId = organizationId;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public void setCreatedByUserId(Long createdByUserId) {
        this.createdByUserId = createdByUserId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public List<ReportTagBinding> getBindings() {
        return bindings;
    }

    public void setBindings(List<ReportTagBinding> bindings) {
        this.bindings = bindings;
    }
}
