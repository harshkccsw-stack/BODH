package com.bodhpsychometric.model.question;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.question.enums.AnswerFormat;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.question.enums.SelectionRule;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

@Entity
@Table(name = "Question",
        indexes = @jakarta.persistence.Index(name = "idxQuestionParent", columnList = "parentQuestionId"))
public class Question implements Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long questionId;

    // Pure bank item: which questionnaires use this question — and where —
    // lives in QuestionnaireQuestion rows, never on this table. A question
    // may appear in many questionnaires, once each.

    /**
     * GROUP members only (V49): the group this question belongs to. Null =
     * a top-level bank question, which is every row that predates groups.
     * Members are composition — created, edited and deleted through their
     * parent's payload, hidden from bank-wide lists, never placed by their
     * own id (the placement PUT places them with their siblings when it
     * places the group). Depth is 1: a GROUP cannot itself be a member.
     * Deliberately no mapped children collection — the question flow loads
     * members by repository query and deletes them explicitly, so the
     * self-reference cannot grow cascade surprises.
     */
    @jakarta.persistence.ManyToOne(fetch = jakarta.persistence.FetchType.LAZY)
    @jakarta.persistence.JoinColumn(name = "parentQuestionId",
            foreignKey = @jakarta.persistence.ForeignKey(name = "fkQuestionParent"))
    private Question parentQuestion;

    /** Position inside the group; null exactly when parentQuestion is. */
    @Column(name = "groupSortOrder")
    private Integer groupSortOrder;

    /**
     * Inverse side of Question 1—* Option. Options live and die with their
     * question: cascade ALL + orphanRemoval means saving/deleting a question
     * takes its options along, and dropping one from this list deletes it.
     */
    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<Option> options = new ArrayList<>();

    /**
     * LIKERT_GRID only: the items rated against the options, which are that
     * grid's shared columns. Empty on every other type. Same composition as
     * options — rows live and die with the question.
     */
    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    private List<QuestionRow> rows = new ArrayList<>();

    /** What the stem is made of. */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "contentType", nullable = false, length = 10)
    private ContentType contentType = ContentType.TEXT;

    /**
     * What SHAPE this question is — MCQ, linear scale, Likert grid. Never
     * null: MCQ is the default and is what every question meant before the
     * column existed. Options are AUTHORED on an MCQ and GENERATED on a
     * LINEAR_SCALE (the points 1—5); QuestionController owns that difference.
     */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "questionType", nullable = false, length = 15)
    private QuestionType questionType = QuestionType.MCQ;

    /**
     * LINEAR_SCALE only: the range the author chose, inclusive — 1—5, 0—10,
     * -3—3. NULL on every other type, and NULL on a scale means 1—5, which is
     * what every scale authored before the range existed was.
     *
     * These are INPUT; the option rows are generated from them and never the
     * other way round, so the two cannot drift.
     */
    @Column(name = "scaleFrom")
    private Integer scaleFrom;

    @Column(name = "scaleTo")
    private Integer scaleTo;

    /** LINEAR_SCALE only: the caption under the first point ("Strongly disagree"). */
    @Column(name = "scaleLowLabel", length = 100)
    private String scaleLowLabel;

    /** LINEAR_SCALE only: the caption under the last point ("Strongly agree"). */
    @Column(name = "scaleHighLabel", length = 100)
    private String scaleHighLabel;

    /**
     * SHORT_ANSWER only: what the typed answer must be — TEXT or a
     * WHOLE_NUMBER (V48). Stored resolved on every short answer, NULL on every
     * other type; read it through {@link #answerFormat()}, which also covers a
     * short answer saved around the question flow.
     */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "answerFormat", length = 12)
    private AnswerFormat answerFormat;

    /**
     * How many options the respondent may pick, with {@link #selectionCount}:
     * MIN/MAX/EQUALS n. NULL — with a NULL count, the two are always set or
     * cleared together — is single choice, which is what every question meant
     * before this existed and what every existing row still says.
     *
     * Turn the pair into a floor and a cap with {@link SelectionBounds}; never
     * interpret the rule in place. Free-text and ranking answers are a
     * different axis (payload shape, not cardinality) and will get their own
     * field — AssessmentAnswer already reserves answerText and rankOrder.
     */
    @Enumerated(value = jakarta.persistence.EnumType.STRING)
    @Column(name = "selectionRule", length = 10)
    private SelectionRule selectionRule;

    /** The n in the rule; null exactly when selectionRule is null. */
    @Column(name = "selectionCount")
    private Integer selectionCount;

    /**
     * MCQ only: deliver the options in a random order instead of the authored
     * one, so two respondents answering the same question meet the choices
     * differently. PRESENTATION, nothing more — an answer stores an optionId,
     * never a position, so scoring, the scoring key and every export keep
     * reading sortOrder and are untouched by this.
     *
     * The order itself is not stored: PortalAssessmentDetailResponse derives
     * it from (attempt, question) with a seeded Random, which makes it stable
     * across a page reload and reproducible afterwards. False on a
     * LINEAR_SCALE (the points 1—5 are ordinal) and on a LIKERT_GRID (the
     * columns are a shared rating scale) — QuestionController refuses both.
     */
    @Column(name = "shuffleOptions", nullable = false)
    private boolean shuffleOptions;

    @Column(name = "stem", columnDefinition = "TEXT")
    private String questionTexString;

    /**
     * Optional help text under the stem — "answer for the last two weeks" —
     * shown to the RESPONDENT, not an authoring note. Null means none, and
     * blank is normalised to null on write so there is only one way to say it.
     *
     * <p>Deliberately NOT frozen by answers: an AssessmentAnswer points at an
     * option, never at this, so re-wording it mid-collection strands nothing.
     * Same reasoning as {@link #shuffleOptions}.
     */
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** Asset location when contentType is not TEXT: uploaded file path for IMAGE/VIDEO, external link for URL. */
    @Column(name = "mediaUrl", columnDefinition = "TEXT")
    private String mediaUrl;

    // ── Kept from the old system, to be refined in a later pass ──────────
    @Column(name = "irtA")
    private Double irtA;

    @Column(name = "irtB")
    private Double irtB;

    @Column(name = "irtC")
    private Double irtC;

    @Column(name = "riskFlag", nullable = false)
    private boolean riskFlag;

    @Column(name = "riskRule", columnDefinition = "TEXT")
    private String riskRule;

    @Column(name = "subDomain", length = 150)
    private String subDomain;

    

    public ContentType getContentType() {
        return contentType;
    }

    public void setContentType(ContentType contentType) {
        this.contentType = contentType;
    }

    public QuestionType getQuestionType() {
        return questionType;
    }

    public void setQuestionType(QuestionType questionType) {
        this.questionType = questionType == null ? QuestionType.MCQ : questionType;
    }

    public Integer getScaleFrom() {
        return scaleFrom;
    }

    public void setScaleFrom(Integer scaleFrom) {
        this.scaleFrom = scaleFrom;
    }

    public Integer getScaleTo() {
        return scaleTo;
    }

    public void setScaleTo(Integer scaleTo) {
        this.scaleTo = scaleTo;
    }

    public String getScaleLowLabel() {
        return scaleLowLabel;
    }

    public void setScaleLowLabel(String scaleLowLabel) {
        this.scaleLowLabel = scaleLowLabel;
    }

    public String getScaleHighLabel() {
        return scaleHighLabel;
    }

    public void setScaleHighLabel(String scaleHighLabel) {
        this.scaleHighLabel = scaleHighLabel;
    }

    public AnswerFormat getAnswerFormat() {
        return answerFormat;
    }

    public void setAnswerFormat(AnswerFormat answerFormat) {
        this.answerFormat = answerFormat;
    }

    /**
     * What this question's typed answer must be: the stored format on a
     * SHORT_ANSWER (TEXT when unset), null on every other type — the one
     * reading every payload goes through, so none of them can disagree.
     */
    public AnswerFormat answerFormat() {
        if (questionType != QuestionType.SHORT_ANSWER) {
            return null;
        }
        return answerFormat == null ? AnswerFormat.TEXT : answerFormat;
    }

    public SelectionRule getSelectionRule() {
        return selectionRule;
    }

    public void setSelectionRule(SelectionRule selectionRule) {
        this.selectionRule = selectionRule;
    }

    public Integer getSelectionCount() {
        return selectionCount;
    }

    public void setSelectionCount(Integer selectionCount) {
        this.selectionCount = selectionCount;
    }

    /** True when the question takes more than one option. */
    public boolean isMultiSelect() {
        return selectionRule != null;
    }

    public boolean isShuffleOptions() {
        return shuffleOptions;
    }

    public void setShuffleOptions(boolean shuffleOptions) {
        this.shuffleOptions = shuffleOptions;
    }

    public String getQuestionTexString() {
        return questionTexString;
    }

    public void setQuestionTexString(String questionTexString) {
        this.questionTexString = questionTexString;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getMediaUrl() {
        return mediaUrl;
    }

    public void setMediaUrl(String mediaUrl) {
        this.mediaUrl = mediaUrl;
    }

    public Double getIrtA() {
        return irtA;
    }

    public void setIrtA(Double irtA) {
        this.irtA = irtA;
    }

    public Double getIrtB() {
        return irtB;
    }

    public void setIrtB(Double irtB) {
        this.irtB = irtB;
    }

    public Double getIrtC() {
        return irtC;
    }

    public void setIrtC(Double irtC) {
        this.irtC = irtC;
    }

    public boolean isRiskFlag() {
        return riskFlag;
    }

    public void setRiskFlag(boolean riskFlag) {
        this.riskFlag = riskFlag;
    }

    public String getRiskRule() {
        return riskRule;
    }

    public void setRiskRule(String riskRule) {
        this.riskRule = riskRule;
    }

    public String getSubDomain() {
        return subDomain;
    }

    public void setSubDomain(String subDomain) {
        this.subDomain = subDomain;
    }

    public static long getSerialversionuid() {
        return serialVersionUID;
    }

    public Long getQuestionId() {
        return questionId;
    }

    public void setQuestionId(Long questionId) {
        this.questionId = questionId;
    }

    public List<Option> getOptions() {
        return options;
    }

    /**
     * The options a respondent CHOOSES between — every option, except on a
     * SHORT_ANSWER, whose one option is the generated text slot (see
     * {@link #textAnswerOption()}) and is never offered as a choice. Every
     * payload that LISTS options (dashboard, portal, MemoryMesh import) goes
     * through this, so a short answer still reads as "no options" everywhere.
     */
    public List<Option> choiceOptions() {
        return questionType == QuestionType.SHORT_ANSWER ? List.of() : options;
    }

    /**
     * The generated option a SHORT_ANSWER's typed answer is stored on (V40,
     * 2026-10-06): one FREE_TEXT row with no label, created by the question
     * flow, never authored or shown. It gives the answer row an optionId like
     * every other answer, for Data Studio and the reports. Empty on every
     * other type, and on a short answer saved around the question flow.
     */
    public java.util.Optional<Option> textAnswerOption() {
        if (questionType != QuestionType.SHORT_ANSWER) {
            return java.util.Optional.empty();
        }
        return options.stream()
                .filter(o -> o.getContentType() == ContentType.FREE_TEXT)
                .findFirst();
    }

    public void setOptions(List<Option> options) {
        this.options = options;
    }

    /** Keeps both sides of the bidirectional link in sync. */
    public void addOption(Option option) {
        options.add(option);
        option.setQuestion(this);
    }

    public void removeOption(Option option) {
        options.remove(option);
        option.setQuestion(null);
    }

    public Question getParentQuestion() {
        return parentQuestion;
    }

    public void setParentQuestion(Question parentQuestion) {
        this.parentQuestion = parentQuestion;
    }

    public Integer getGroupSortOrder() {
        return groupSortOrder;
    }

    public void setGroupSortOrder(Integer groupSortOrder) {
        this.groupSortOrder = groupSortOrder;
    }

    /** True on a GROUP parent — the heading row whose members hold the content. */
    public boolean isGroup() {
        return questionType == QuestionType.GROUP;
    }

    /** True on a question living inside a group. */
    public boolean isGroupMember() {
        return parentQuestion != null;
    }

    public List<QuestionRow> getRows() {
        return rows;
    }

    public void setRows(List<QuestionRow> rows) {
        this.rows = rows;
    }

    public void addRow(QuestionRow row) {
        rows.add(row);
        row.setQuestion(this);
    }

    public void removeRow(QuestionRow row) {
        rows.remove(row);
        row.setQuestion(null);
    }

    

}