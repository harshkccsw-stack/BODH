package com.bodhpsychometric.model.game;

import java.time.OffsetDateTime;

import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import com.bodhpsychometric.model.assessment.AssessmentAnswer;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * What one PART of a finished game measured (V43). Attention Baseline has one
 * part; Color Clash + Mackworth Clock has two — so a played game is one or
 * more rows, all hanging off the one {@link AssessmentAnswer} that finishing
 * it produced (the GAMES question's option). Respondent, assessment and
 * question are that answer's; they are not repeated here.
 *
 * <p>Every part reports the same core metrics, so the columns are shared by
 * every game; what a part does not measure stays null. Written ONLY by
 * AssessmentSubmissionWriter, in the submit's own transaction, right after the
 * answer rows — never by a call of its own.
 *
 * <p>The answer link cascades in the DATABASE ({@code ON DELETE CASCADE}):
 * the answer set is deleted by a submit's replace-all, a practitioner reset
 * and a MemoryMesh sync, and the results must go with it on all of them.
 * {@link OnDelete} gives the H2 test schema the same rule.
 */
@Entity
@Table(name = "GameResult",
        uniqueConstraints = @UniqueConstraint(name = "uqGrAnswerPart", columnNames = {"assessmentAnswerId", "partCode"}),
        indexes = @Index(name = "idxGrGame", columnList = "gameId"))
public class GameResult implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long gameResultId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assessmentAnswerId", nullable = false,
            foreignKey = @ForeignKey(name = "fkGrAnswer"))
    @OnDelete(action = OnDeleteAction.CASCADE)
    private AssessmentAnswer answer;

    /** The game played. Never cascaded: a game with results cannot be deleted. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "gameId", nullable = false,
            foreignKey = @ForeignKey(name = "fkGrGame"))
    private Game game;

    /** A COPY of the game's version at submit time — the game row's can be bumped later. */
    @Column(name = "gameVersion", nullable = false)
    private int gameVersion;

    /** Which part of the game — BASELINE, COLOR_CLASH, MACKWORTH_CLOCK; named by the game file. */
    @Column(name = "partCode", nullable = false, length = 40)
    private String partCode;

    /** 1, 2 … in the order the parts were played. */
    @Column(name = "partOrder", nullable = false)
    private int partOrder;

    /** Correct responses. */
    @Column(name = "hits", nullable = false)
    private int hits;

    /** Responses with nothing to respond to (wrong clicks, presses with no jump). */
    @Column(name = "falseAlarms", nullable = false)
    private int falseAlarms;

    /** Targets let go by. */
    @Column(name = "omissions", nullable = false)
    private int omissions;

    /** Time spent playing this part, pauses EXCLUDED. */
    @Column(name = "durationMs", nullable = false)
    private long durationMs;

    @Column(name = "mouseDistancePx", nullable = false)
    private long mouseDistancePx;

    /** Seconds, while playing, in which the pointer did not move. */
    @Column(name = "mouseIdleSeconds", nullable = false)
    private int mouseIdleSeconds;

    /** Time on the part's "How to play" and instruction pages, every visit summed. Null when not measured. */
    @Column(name = "instructionTimeMs")
    private Long instructionTimeMs;

    /** The group picked at the start of a grouped game — on every part's row. */
    @Column(name = "groupNumber")
    private Integer groupNumber;

    @Column(name = "groupName", length = 30)
    private String groupName;

    /** Null when the game has no pause; 0 when it has one and it was not used. */
    @Column(name = "pauseCount")
    private Integer pauseCount;

    @Column(name = "pauseDurationMs")
    private Long pauseDurationMs;

    /** The browser's clock at the part's start and end — so pauses are inside the span. */
    @Column(name = "startedAt")
    private OffsetDateTime startedAt;

    @Column(name = "endedAt")
    private OffsetDateTime endedAt;

    public Long getGameResultId() {
        return gameResultId;
    }

    public AssessmentAnswer getAnswer() {
        return answer;
    }

    public void setAnswer(AssessmentAnswer answer) {
        this.answer = answer;
    }

    public Game getGame() {
        return game;
    }

    public void setGame(Game game) {
        this.game = game;
    }

    public int getGameVersion() {
        return gameVersion;
    }

    public void setGameVersion(int gameVersion) {
        this.gameVersion = gameVersion;
    }

    public String getPartCode() {
        return partCode;
    }

    public void setPartCode(String partCode) {
        this.partCode = partCode;
    }

    public int getPartOrder() {
        return partOrder;
    }

    public void setPartOrder(int partOrder) {
        this.partOrder = partOrder;
    }

    public int getHits() {
        return hits;
    }

    public void setHits(int hits) {
        this.hits = hits;
    }

    public int getFalseAlarms() {
        return falseAlarms;
    }

    public void setFalseAlarms(int falseAlarms) {
        this.falseAlarms = falseAlarms;
    }

    public int getOmissions() {
        return omissions;
    }

    public void setOmissions(int omissions) {
        this.omissions = omissions;
    }

    public long getDurationMs() {
        return durationMs;
    }

    public void setDurationMs(long durationMs) {
        this.durationMs = durationMs;
    }

    public long getMouseDistancePx() {
        return mouseDistancePx;
    }

    public void setMouseDistancePx(long mouseDistancePx) {
        this.mouseDistancePx = mouseDistancePx;
    }

    public int getMouseIdleSeconds() {
        return mouseIdleSeconds;
    }

    public void setMouseIdleSeconds(int mouseIdleSeconds) {
        this.mouseIdleSeconds = mouseIdleSeconds;
    }

    public Long getInstructionTimeMs() {
        return instructionTimeMs;
    }

    public void setInstructionTimeMs(Long instructionTimeMs) {
        this.instructionTimeMs = instructionTimeMs;
    }

    public Integer getGroupNumber() {
        return groupNumber;
    }

    public void setGroupNumber(Integer groupNumber) {
        this.groupNumber = groupNumber;
    }

    public String getGroupName() {
        return groupName;
    }

    public void setGroupName(String groupName) {
        this.groupName = groupName;
    }

    public Integer getPauseCount() {
        return pauseCount;
    }

    public void setPauseCount(Integer pauseCount) {
        this.pauseCount = pauseCount;
    }

    public Long getPauseDurationMs() {
        return pauseDurationMs;
    }

    public void setPauseDurationMs(Long pauseDurationMs) {
        this.pauseDurationMs = pauseDurationMs;
    }

    public OffsetDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(OffsetDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public OffsetDateTime getEndedAt() {
        return endedAt;
    }

    public void setEndedAt(OffsetDateTime endedAt) {
        this.endedAt = endedAt;
    }
}
