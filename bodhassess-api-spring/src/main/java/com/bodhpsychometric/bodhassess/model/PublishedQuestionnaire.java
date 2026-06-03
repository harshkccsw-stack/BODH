package com.bodhpsychometric.bodhassess.model;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.persistence.CascadeType;
import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.OneToMany;
import javax.persistence.OrderBy;
import javax.persistence.Table;

@Entity
@Table(name = "published_questionnaires")
public class PublishedQuestionnaire {

    @Id
    private String id;

    private String name;

    @Column(name = "short_name")
    private String shortName;

    private String vertical;

    private String category;

    @Column(columnDefinition = "text")
    private String description;

    private Integer duration;

    private String tier;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "published_questionnaire_languages",
            joinColumns = @JoinColumn(name = "questionnaire_id"))
    @Column(name = "language", nullable = false, length = 8)
    private Set<String> languages = new HashSet<>();

    // Snapshot of the MQ tree as published. Top-level MQs only here —
    // nested MQTs hang off each PublishedQuestionnaireMq.
    @OneToMany(mappedBy = "questionnaire", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<PublishedQuestionnaireMq> mqs = new ArrayList<>();

    // Snapshot of every question on the questionnaire, in publish order.
    @OneToMany(mappedBy = "questionnaire", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<PublishedQuestionnaireQuestion> questions = new ArrayList<>();

    @Column(name = "is_demo")
    private boolean isDemo;

    @Column(columnDefinition = "text")
    private String disclaimer;

    // Optional pre-assessment instructions. The boolean is the author's
    // toggle ("show this on the portal?") — the text can be saved while
    // disabled so toggling back on doesn't lose the draft.
    @Column(columnDefinition = "text")
    private String instructions;

    @Column(name = "show_instructions", nullable = false)
    private boolean showInstructions;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "published_questionnaire_demographic_keys",
            joinColumns = @JoinColumn(name = "questionnaire_id"))
    @Column(name = "field_key", nullable = false, length = 128)
    private Set<String> demographicFieldKeys = new HashSet<>();

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    // ---------- Versioning (Git-style) ----------
    //
    // Each PublishedQuestionnaire row is now a *version* of a parent
    // Questionnaire. Status drives whether it can be edited (DRAFT) or
    // allotted (COMMITTED). version_major + version_minor produce the
    // semver-style label admins see ("v1.2"). branched_from_version_id is
    // optional — drafts may start blank.
    //
    // Legacy rows that pre-date this migration are marked COMMITTED at
    // v1.0 by the startup runner so existing assessments keep working.

    @Column(name = "parent_id", length = 64)
    private String parentId;

    @Column(name = "version_major", nullable = false)
    private Integer versionMajor = 1;

    @Column(name = "version_minor", nullable = false)
    private Integer versionMinor = 0;

    @Column(name = "version_label")
    private String versionLabel;

    @Column(name = "version_name")
    private String versionName;

    @Column(name = "version_comments", columnDefinition = "text")
    private String versionComments;

    // DRAFT | COMMITTED. Plain string instead of enum so adding a new
    // state (eg. ARCHIVED) later doesn't need a migration.
    @Column(name = "version_status", length = 16, nullable = false)
    private String versionStatus = "COMMITTED";

    @Column(name = "branched_from_version_id", length = 64)
    private String branchedFromVersionId;

    @Column(name = "committed_at")
    private OffsetDateTime committedAt;

    @Column(name = "committed_by")
    private String committedBy;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public Integer getVersionMajor() { return versionMajor; }
    public void setVersionMajor(Integer versionMajor) { this.versionMajor = versionMajor; }
    public Integer getVersionMinor() { return versionMinor; }
    public void setVersionMinor(Integer versionMinor) { this.versionMinor = versionMinor; }
    public String getVersionLabel() { return versionLabel; }
    public void setVersionLabel(String versionLabel) { this.versionLabel = versionLabel; }
    public String getVersionName() { return versionName; }
    public void setVersionName(String versionName) { this.versionName = versionName; }
    public String getVersionComments() { return versionComments; }
    public void setVersionComments(String versionComments) { this.versionComments = versionComments; }
    public String getVersionStatus() { return versionStatus; }
    public void setVersionStatus(String versionStatus) { this.versionStatus = versionStatus; }
    public String getBranchedFromVersionId() { return branchedFromVersionId; }
    public void setBranchedFromVersionId(String branchedFromVersionId) { this.branchedFromVersionId = branchedFromVersionId; }
    public OffsetDateTime getCommittedAt() { return committedAt; }
    public void setCommittedAt(OffsetDateTime committedAt) { this.committedAt = committedAt; }
    public String getCommittedBy() { return committedBy; }
    public void setCommittedBy(String committedBy) { this.committedBy = committedBy; }
    public String getShortName() { return shortName; }
    public void setShortName(String shortName) { this.shortName = shortName; }
    public String getVertical() { return vertical; }
    public void setVertical(String vertical) { this.vertical = vertical; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getDuration() { return duration; }
    public void setDuration(Integer duration) { this.duration = duration; }
    public String getTier() { return tier; }
    public void setTier(String tier) { this.tier = tier; }
    public Set<String> getLanguages() { return languages; }
    public void setLanguages(Set<String> languages) { this.languages = languages; }
    public List<PublishedQuestionnaireMq> getMqs() { return mqs; }
    public void setMqs(List<PublishedQuestionnaireMq> mqs) { this.mqs = mqs; }
    public List<PublishedQuestionnaireQuestion> getQuestions() { return questions; }
    public void setQuestions(List<PublishedQuestionnaireQuestion> questions) { this.questions = questions; }
    public boolean isDemo() { return isDemo; }
    public void setDemo(boolean demo) { isDemo = demo; }
    public String getDisclaimer() { return disclaimer; }
    public void setDisclaimer(String disclaimer) { this.disclaimer = disclaimer; }
    public String getInstructions() { return instructions; }
    public void setInstructions(String instructions) { this.instructions = instructions; }
    public boolean isShowInstructions() { return showInstructions; }
    public void setShowInstructions(boolean showInstructions) { this.showInstructions = showInstructions; }
    public Set<String> getDemographicFieldKeys() { return demographicFieldKeys; }
    public void setDemographicFieldKeys(Set<String> demographicFieldKeys) { this.demographicFieldKeys = demographicFieldKeys; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
