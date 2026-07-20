package com.bodhpsychometric.bodhassess.domain.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.assessment.Assessment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentGroupAllotment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentOrganizationAllotment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentRespondentAllotment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentStatus;
import com.bodhpsychometric.bodhassess.domain.auth.User;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.Organization;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.RespondentGroup;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentGroupAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentOrganizationAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentRespondentAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireRepository;
import com.bodhpsychometric.bodhassess.domain.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;
import com.bodhpsychometric.bodhassess.domain.questionnaire.Questionnaire;

/** Create/lifecycle of assessments and the three allotment kinds with caps. */
@Service
@Transactional
public class AssessmentAdminService {

    private final AssessmentRepository assessmentRepository;
    private final QuestionnaireRepository questionnaireRepository;
    private final AssessmentOrganizationAllotmentRepository orgAllotmentRepository;
    private final AssessmentGroupAllotmentRepository groupAllotmentRepository;
    private final AssessmentRespondentAllotmentRepository respondentAllotmentRepository;
    private final OrganizationRepository organizationRepository;
    private final RespondentGroupRepository groupRepository;
    private final UserRepository userRepository;

    public AssessmentAdminService(AssessmentRepository assessmentRepository,
                                  QuestionnaireRepository questionnaireRepository,
                                  AssessmentOrganizationAllotmentRepository orgAllotmentRepository,
                                  AssessmentGroupAllotmentRepository groupAllotmentRepository,
                                  AssessmentRespondentAllotmentRepository respondentAllotmentRepository,
                                  OrganizationRepository organizationRepository,
                                  RespondentGroupRepository groupRepository,
                                  UserRepository userRepository) {
        this.assessmentRepository = assessmentRepository;
        this.questionnaireRepository = questionnaireRepository;
        this.orgAllotmentRepository = orgAllotmentRepository;
        this.groupAllotmentRepository = groupAllotmentRepository;
        this.respondentAllotmentRepository = respondentAllotmentRepository;
        this.organizationRepository = organizationRepository;
        this.groupRepository = groupRepository;
        this.userRepository = userRepository;
    }

    public Assessment create(String name, Long questionnaireId, boolean autoNext, Set<String> languages) {
        Questionnaire questionnaire = questionnaireRepository.findByIdAndDeletedAtIsNull(questionnaireId)
                .orElseThrow(() -> new NotFoundException("Questionnaire", questionnaireId));
        Assessment assessment = new Assessment();
        assessment.setName(name);
        assessment.setQuestionnaire(questionnaire);
        assessment.setAutoNext(autoNext);
        if (languages != null) assessment.setLanguages(languages);
        return assessmentRepository.save(assessment);
    }

    public Assessment setStatus(Long assessmentId, AssessmentStatus status) {
        Assessment assessment = live(assessmentId);
        assessment.setStatus(status);
        return assessment;
    }

    public void bin(Long assessmentId) {
        live(assessmentId).moveToBin(OffsetDateTime.now());
    }

    public void restore(Long assessmentId) {
        assessmentRepository.findById(assessmentId)
                .orElseThrow(() -> new NotFoundException("Assessment", assessmentId))
                .restoreFromBin();
    }

    // ── Allotments ───────────────────────────────────────────────────────

    public AssessmentOrganizationAllotment allotToOrganization(Long assessmentId, Long organizationId, Integer cap) {
        Assessment assessment = allottable(assessmentId);
        Organization organization = organizationRepository.findByIdAndDeletedAtIsNull(organizationId)
                .orElseThrow(() -> new NotFoundException("Organization", organizationId));
        if (orgAllotmentRepository.existsByAssessmentIdAndOrganizationId(assessmentId, organizationId)) {
            throw new ConflictException("Assessment already allotted to organization " + organizationId);
        }
        AssessmentOrganizationAllotment allotment = new AssessmentOrganizationAllotment();
        allotment.setAssessment(assessment);
        allotment.setOrganization(organization);
        allotment.setCap(cap);
        return orgAllotmentRepository.save(allotment);
    }

    public AssessmentGroupAllotment allotToGroup(Long assessmentId, Long groupId, Integer cap) {
        Assessment assessment = allottable(assessmentId);
        RespondentGroup group = groupRepository.findByIdAndDeletedAtIsNull(groupId)
                .orElseThrow(() -> new NotFoundException("RespondentGroup", groupId));
        if (groupAllotmentRepository.existsByAssessmentIdAndGroupId(assessmentId, groupId)) {
            throw new ConflictException("Assessment already allotted to group " + groupId);
        }
        AssessmentGroupAllotment allotment = new AssessmentGroupAllotment();
        allotment.setAssessment(assessment);
        allotment.setGroup(group);
        allotment.setCap(cap);
        return groupAllotmentRepository.save(allotment);
    }

    public AssessmentRespondentAllotment allotToRespondent(Long assessmentId, Long userId) {
        Assessment assessment = allottable(assessmentId);
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new NotFoundException("User", userId));
        if (respondentAllotmentRepository.existsByAssessmentIdAndUserId(assessmentId, userId)) {
            throw new ConflictException("Assessment already allotted to user " + userId);
        }
        AssessmentRespondentAllotment allotment = new AssessmentRespondentAllotment();
        allotment.setAssessment(assessment);
        allotment.setUser(user);
        return respondentAllotmentRepository.save(allotment);
    }

    public AssessmentOrganizationAllotment updateOrganizationCap(Long assessmentId, Long organizationId, Integer cap) {
        AssessmentOrganizationAllotment allotment = orgAllotmentRepository
                .findByAssessmentIdAndOrganizationId(assessmentId, organizationId)
                .orElseThrow(() -> new NotFoundException("AssessmentOrganizationAllotment",
                        assessmentId + "/" + organizationId));
        allotment.setCap(cap);
        return allotment;
    }

    public AssessmentGroupAllotment updateGroupCap(Long assessmentId, Long groupId, Integer cap) {
        AssessmentGroupAllotment allotment = groupAllotmentRepository
                .findByAssessmentIdAndGroupId(assessmentId, groupId)
                .orElseThrow(() -> new NotFoundException("AssessmentGroupAllotment",
                        assessmentId + "/" + groupId));
        allotment.setCap(cap);
        return allotment;
    }

    @Transactional(readOnly = true)
    public List<Assessment> listLive() {
        return assessmentRepository.findByDeletedAtIsNullOrderByCreatedAtDesc();
    }

    @Transactional(readOnly = true)
    public Assessment get(Long assessmentId) {
        return live(assessmentId);
    }

    private Assessment allottable(Long assessmentId) {
        Assessment assessment = live(assessmentId);
        if (assessment.getStatus() == AssessmentStatus.CLOSED) {
            throw new ConflictException("Assessment " + assessmentId + " is CLOSED — no new allotments");
        }
        return assessment;
    }

    private Assessment live(Long id) {
        return assessmentRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("Assessment", id));
    }
}
