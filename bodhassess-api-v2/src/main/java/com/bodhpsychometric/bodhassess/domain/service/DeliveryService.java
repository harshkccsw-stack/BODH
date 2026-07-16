package com.bodhpsychometric.bodhassess.domain.service;

import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.assessment.Assessment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentGroupAllotment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentOrganizationAllotment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentStatus;
import com.bodhpsychometric.bodhassess.domain.delivery.AssessmentAttempt;
import com.bodhpsychometric.bodhassess.domain.delivery.AssessmentSession;
import com.bodhpsychometric.bodhassess.domain.delivery.AttemptStatus;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionAnswer;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionAnswerOption;
import com.bodhpsychometric.bodhassess.domain.item.AnswerOption;
import com.bodhpsychometric.bodhassess.domain.item.Item;
import com.bodhpsychometric.bodhassess.domain.item.ItemFormat;
import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.repository.AnswerOptionRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentAttemptRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentGroupAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentOrganizationAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentRespondentAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentSessionRepository;
import com.bodhpsychometric.bodhassess.domain.repository.ItemRepository;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationMemberRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireItemRepository;
import com.bodhpsychometric.bodhassess.domain.repository.RespondentGroupMemberRepository;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionTraitScore;
import com.bodhpsychometric.bodhassess.domain.repository.SessionAnswerRepository;
import com.bodhpsychometric.bodhassess.domain.repository.SessionTraitScoreRepository;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;

/**
 * The take-flow. Vocabulary matches the product: RESUME (continue the live
 * attempt, partial answers load) vs RESET (admin archives the live attempt —
 * nothing wiped — and a fresh one spawns).
 *
 * Cap rule: an allotment cap counts sessions whose LIVE attempt is COMPLETED.
 * Submit consumes a slot, reset frees it. Checked at session start AND
 * re-checked at submit to close the concurrent-takers race.
 */
@Service
@Transactional
public class DeliveryService {

    public record Selection(Long optionId, Integer rankOrder) {}

    private final AssessmentRepository assessmentRepository;
    private final AssessmentSessionRepository sessionRepository;
    private final AssessmentAttemptRepository attemptRepository;
    private final SessionAnswerRepository answerRepository;
    private final AssessmentRespondentAllotmentRepository respondentAllotmentRepository;
    private final AssessmentGroupAllotmentRepository groupAllotmentRepository;
    private final AssessmentOrganizationAllotmentRepository orgAllotmentRepository;
    private final RespondentGroupMemberRepository groupMemberRepository;
    private final OrganizationMemberRepository orgMemberRepository;
    private final QuestionnaireItemRepository usageRepository;
    private final ItemRepository itemRepository;
    private final AnswerOptionRepository optionRepository;
    private final UserRepository userRepository;
    private final SessionTraitScoreRepository traitScoreRepository;
    private final ScoringService scoringService;

    public DeliveryService(AssessmentRepository assessmentRepository,
                           AssessmentSessionRepository sessionRepository,
                           AssessmentAttemptRepository attemptRepository,
                           SessionAnswerRepository answerRepository,
                           AssessmentRespondentAllotmentRepository respondentAllotmentRepository,
                           AssessmentGroupAllotmentRepository groupAllotmentRepository,
                           AssessmentOrganizationAllotmentRepository orgAllotmentRepository,
                           RespondentGroupMemberRepository groupMemberRepository,
                           OrganizationMemberRepository orgMemberRepository,
                           QuestionnaireItemRepository usageRepository,
                           ItemRepository itemRepository,
                           AnswerOptionRepository optionRepository,
                           UserRepository userRepository,
                           SessionTraitScoreRepository traitScoreRepository,
                           ScoringService scoringService) {
        this.assessmentRepository = assessmentRepository;
        this.sessionRepository = sessionRepository;
        this.attemptRepository = attemptRepository;
        this.answerRepository = answerRepository;
        this.respondentAllotmentRepository = respondentAllotmentRepository;
        this.groupAllotmentRepository = groupAllotmentRepository;
        this.orgAllotmentRepository = orgAllotmentRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.orgMemberRepository = orgMemberRepository;
        this.usageRepository = usageRepository;
        this.itemRepository = itemRepository;
        this.optionRepository = optionRepository;
        this.userRepository = userRepository;
        this.traitScoreRepository = traitScoreRepository;
        this.scoringService = scoringService;
    }

    // ── Session provisioning ─────────────────────────────────────────────

    /**
     * Creates the session (attempt 1 included) after resolving which
     * allotment door lets this user in: direct, via a group, or via an
     * organization — recorded as the session's scope for cap accounting.
     */
    public AssessmentSession provisionSession(Long assessmentId, Long userId, String language) {
        Assessment assessment = takeable(assessmentId);
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));
        sessionRepository.findByAssessmentIdAndUserIdAndDeletedAtIsNull(assessmentId, userId)
                .ifPresent(existing -> {
                    throw new ConflictException("User " + userId + " already has session "
                            + existing.getId() + " for this assessment");
                });

        AssessmentSession session = new AssessmentSession();
        session.setAssessment(assessment);
        session.setUser(user);
        session.setLanguage(language);

        if (!resolveScope(assessmentId, userId, session)) {
            throw new ConflictException("User " + userId + " is not allotted assessment " + assessmentId);
        }
        checkCap(session, "start");

        AssessmentAttempt first = new AssessmentAttempt();
        first.setAttemptNumber(1);
        session.addAttempt(first);
        return sessionRepository.save(session);
    }

    /** RESUME: the live attempt, marked started on first entry. */
    public AssessmentAttempt startOrResume(Long sessionId) {
        AssessmentSession session = liveSession(sessionId);
        takeable(session.getAssessment().getId());
        AssessmentAttempt attempt = liveAttempt(sessionId);
        if (attempt.getStatus() == AttemptStatus.COMPLETED) {
            throw new ConflictException("Attempt is already completed — an admin reset is required to retake");
        }
        if (attempt.getStatus() == AttemptStatus.NOT_STARTED) {
            attempt.setStatus(AttemptStatus.IN_PROGRESS);
            attempt.setStartedAt(OffsetDateTime.now());
        }
        return attempt;
    }

    // ── Answering ────────────────────────────────────────────────────────

    public SessionAnswer saveAnswer(Long sessionId, Long itemId, List<Selection> selections, String freeText) {
        AssessmentSession session = liveSession(sessionId);
        AssessmentAttempt attempt = liveAttempt(sessionId);
        if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            throw new ConflictException("Attempt is " + attempt.getStatus() + " — start the session first");
        }
        Long questionnaireId = session.getAssessment().getQuestionnaire().getId();
        if (!usageRepository.existsByQuestionnaireIdAndItemId(questionnaireId, itemId)) {
            throw new ValidationException("Item " + itemId + " is not part of this assessment's questionnaire");
        }
        Item item = itemRepository.findById(itemId)
                .orElseThrow(() -> new NotFoundException("Item", itemId));

        SessionAnswer answer = answerRepository.findByAttemptIdAndItemId(attempt.getId(), itemId)
                .orElseGet(() -> {
                    SessionAnswer created = new SessionAnswer();
                    created.setItem(item);
                    attempt.addAnswer(created);
                    return created;
                });

        if (item.getFormat() == ItemFormat.FREE_TEXT) {
            if (selections != null && !selections.isEmpty()) {
                throw new ValidationException("FREE_TEXT items take no option selections");
            }
            answer.setFreeText(freeText);
            answer.getSelectedOptions().clear();
            return answerRepository.save(answer);
        }

        if (selections == null || selections.isEmpty()) {
            throw new ValidationException("At least one option must be selected");
        }
        answer.setFreeText(null);
        answer.getSelectedOptions().clear();
        for (Selection selection : selections) {
            AnswerOption option = optionRepository.findById(selection.optionId())
                    .orElseThrow(() -> new NotFoundException("AnswerOption", selection.optionId()));
            if (!option.getItem().getId().equals(itemId)) {
                throw new ValidationException("Option " + selection.optionId()
                        + " does not belong to item " + itemId);
            }
            SessionAnswerOption row = new SessionAnswerOption();
            row.setOption(option);
            row.setRankOrder(selection.rankOrder());
            answer.addSelectedOption(row);
        }
        return answerRepository.save(answer);
    }

    // ── Submit / reset ───────────────────────────────────────────────────

    /** Scores server-side, freezes the result, consumes cap (re-checked here). */
    public AssessmentAttempt submit(Long sessionId) {
        AssessmentSession session = liveSession(sessionId);
        AssessmentAttempt attempt = liveAttempt(sessionId);
        if (attempt.getStatus() != AttemptStatus.IN_PROGRESS) {
            throw new ConflictException("Attempt is " + attempt.getStatus() + " — nothing to submit");
        }
        checkCap(session, "submit");
        scoringService.scoreAttempt(attempt, session.getAssessment().getQuestionnaire().getId());
        attempt.setStatus(AttemptStatus.COMPLETED);
        attempt.setCompletedAt(OffsetDateTime.now());
        return attempt;
    }

    /**
     * Admin RESET: the live attempt is archived — answers, scores and
     * demographics all stay, forever — and a fresh attempt begins. Frees the
     * cap slot the completed attempt was consuming.
     */
    public AssessmentAttempt reset(Long sessionId) {
        liveSession(sessionId);
        AssessmentAttempt current = liveAttempt(sessionId);
        current.setArchivedAt(OffsetDateTime.now());

        AssessmentAttempt next = new AssessmentAttempt();
        next.setAttemptNumber(current.getAttemptNumber() + 1);
        current.getSession().addAttempt(next);
        return attemptRepository.save(next);
    }

    // ── Reads ────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public AssessmentSession getSession(Long sessionId) {
        return liveSession(sessionId);
    }

    @Transactional(readOnly = true)
    public List<SessionAnswer> answersOfLiveAttempt(Long sessionId) {
        return answerRepository.findWithSelectionsByAttemptId(liveAttempt(sessionId).getId());
    }

    @Transactional(readOnly = true)
    public List<SessionTraitScore> resultsOfLiveAttempt(Long sessionId) {
        return traitScoreRepository.findWithPlacementsByAttemptId(liveAttempt(sessionId).getId());
    }

    // ── internals ────────────────────────────────────────────────────────

    private boolean resolveScope(Long assessmentId, Long userId, AssessmentSession session) {
        if (respondentAllotmentRepository.existsByAssessmentIdAndUserId(assessmentId, userId)) {
            return true;   // direct — no org/group scope
        }
        for (AssessmentGroupAllotment allotment : groupAllotmentRepository.findByAssessmentId(assessmentId)) {
            if (groupMemberRepository.existsByGroupIdAndUserIdAndRemovedAtIsNull(
                    allotment.getGroup().getId(), userId)) {
                session.setGroup(allotment.getGroup());
                session.setOrganization(allotment.getGroup().getOrganization());
                return true;
            }
        }
        for (AssessmentOrganizationAllotment allotment : orgAllotmentRepository.findByAssessmentId(assessmentId)) {
            if (orgMemberRepository.existsByOrganizationIdAndUserIdAndRemovedAtIsNull(
                    allotment.getOrganization().getId(), userId)) {
                session.setOrganization(allotment.getOrganization());
                return true;
            }
        }
        return false;
    }

    private void checkCap(AssessmentSession session, String stage) {
        Long assessmentId = session.getAssessment().getId();
        if (session.getGroup() != null) {
            Integer cap = groupAllotmentRepository
                    .findByAssessmentIdAndGroupId(assessmentId, session.getGroup().getId())
                    .map(AssessmentGroupAllotment::getCap).orElse(null);
            if (cap != null && sessionRepository.countCapConsumedForGroup(
                    assessmentId, session.getGroup().getId()) >= cap) {
                throw new ConflictException("Group cap (" + cap + ") exhausted at " + stage);
            }
        } else if (session.getOrganization() != null) {
            Integer cap = orgAllotmentRepository
                    .findByAssessmentIdAndOrganizationId(assessmentId, session.getOrganization().getId())
                    .map(AssessmentOrganizationAllotment::getCap).orElse(null);
            if (cap != null && sessionRepository.countCapConsumedForOrganization(
                    assessmentId, session.getOrganization().getId()) >= cap) {
                throw new ConflictException("Organization cap (" + cap + ") exhausted at " + stage);
            }
        }
        // Direct respondent allotments carry no cap by design.
    }

    private Assessment takeable(Long assessmentId) {
        Assessment assessment = assessmentRepository.findByIdAndDeletedAtIsNull(assessmentId)
                .orElseThrow(() -> new NotFoundException("Assessment", assessmentId));
        if (assessment.getStatus() == AssessmentStatus.PAUSED) {
            throw new ConflictException("Assessment is paused");
        }
        return assessment;
    }

    private AssessmentSession liveSession(Long sessionId) {
        return sessionRepository.findByIdAndDeletedAtIsNull(sessionId)
                .orElseThrow(() -> new NotFoundException("AssessmentSession", sessionId));
    }

    private AssessmentAttempt liveAttempt(Long sessionId) {
        return attemptRepository.findBySessionIdAndArchivedAtIsNull(sessionId)
                .orElseThrow(() -> new ConflictException("Session " + sessionId + " has no live attempt"));
    }
}
