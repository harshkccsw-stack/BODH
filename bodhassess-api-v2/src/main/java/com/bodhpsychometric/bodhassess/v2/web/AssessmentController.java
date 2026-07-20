package com.bodhpsychometric.bodhassess.v2.web;

import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.domain.assessment.Assessment;
import com.bodhpsychometric.bodhassess.domain.assessment.AssessmentStatus;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentGroupAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.repository.AssessmentOrganizationAllotmentRepository;
import com.bodhpsychometric.bodhassess.domain.service.AssessmentAdminService;
import com.bodhpsychometric.repository.AssessmentRespondentAllotmentRepository;

@RestController
@RequestMapping("/api/v2/assessments")
public class AssessmentController {

    public record CreateAssessmentRequest(String name, Long questionnaireId, Boolean autoNext,
                                          Set<String> languages) {}
    public record StatusRequest(AssessmentStatus status) {}
    public record OrgAllotmentRequest(Long organizationId, Integer cap) {}
    public record GroupAllotmentRequest(Long groupId, Integer cap) {}
    public record RespondentAllotmentRequest(Long userId) {}
    public record CapRequest(Integer cap) {}

    public record AssessmentDto(Long id, String name, Long questionnaireId, AssessmentStatus status,
                                boolean autoNext, Set<String> languages) {
        static AssessmentDto from(Assessment a) {
            return new AssessmentDto(a.getId(), a.getName(), a.getQuestionnaire().getId(),
                    a.getStatus(), a.isAutoNext(), a.getLanguages());
        }
    }

    public record AllotmentDto(Long id, String kind, Long targetId, Integer cap) {}

    private final AssessmentAdminService assessments;
    private final AssessmentOrganizationAllotmentRepository orgAllotments;
    private final AssessmentGroupAllotmentRepository groupAllotments;
    private final AssessmentRespondentAllotmentRepository respondentAllotments;

    public AssessmentController(AssessmentAdminService assessments,
                                AssessmentOrganizationAllotmentRepository orgAllotments,
                                AssessmentGroupAllotmentRepository groupAllotments,
                                AssessmentRespondentAllotmentRepository respondentAllotments) {
        this.assessments = assessments;
        this.orgAllotments = orgAllotments;
        this.groupAllotments = groupAllotments;
        this.respondentAllotments = respondentAllotments;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AssessmentDto create(@RequestBody CreateAssessmentRequest body) {
        return AssessmentDto.from(assessments.create(body.name(), body.questionnaireId(),
                Boolean.TRUE.equals(body.autoNext()), body.languages()));
    }

    @GetMapping
    public List<AssessmentDto> list() {
        return assessments.listLive().stream().map(AssessmentDto::from).toList();
    }

    @GetMapping("/{id}")
    public AssessmentDto get(@PathVariable Long id) {
        return AssessmentDto.from(assessments.get(id));
    }

    @PutMapping("/{id}/status")
    public AssessmentDto setStatus(@PathVariable Long id, @RequestBody StatusRequest body) {
        return AssessmentDto.from(assessments.setStatus(id, body.status()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bin(@PathVariable Long id) {
        assessments.bin(id);
    }

    @PostMapping("/{id}/restore")
    public void restore(@PathVariable Long id) {
        assessments.restore(id);
    }

    // ── Allotments ───────────────────────────────────────────────────────

    @GetMapping("/{id}/allotments")
    public List<AllotmentDto> allotments(@PathVariable Long id) {
        List<AllotmentDto> all = new java.util.ArrayList<>();
        orgAllotments.findByAssessmentId(id).forEach(a -> all.add(
                new AllotmentDto(a.getId(), "organization", a.getOrganization().getId(), a.getCap())));
        groupAllotments.findByAssessmentId(id).forEach(a -> all.add(
                new AllotmentDto(a.getId(), "group", a.getGroup().getId(), a.getCap())));
        respondentAllotments.findByAssessmentId(id).forEach(a -> all.add(
                new AllotmentDto(a.getId(), "respondent", a.getUser().getId(), null)));
        return all;
    }

    @PostMapping("/{id}/allotments/organizations")
    @ResponseStatus(HttpStatus.CREATED)
    public AllotmentDto allotOrganization(@PathVariable Long id, @RequestBody OrgAllotmentRequest body) {
        var allotment = assessments.allotToOrganization(id, body.organizationId(), body.cap());
        return new AllotmentDto(allotment.getId(), "organization", body.organizationId(), allotment.getCap());
    }

    @PutMapping("/{id}/allotments/organizations/{organizationId}/cap")
    public AllotmentDto updateOrgCap(@PathVariable Long id, @PathVariable Long organizationId,
                                     @RequestBody CapRequest body) {
        var allotment = assessments.updateOrganizationCap(id, organizationId, body.cap());
        return new AllotmentDto(allotment.getId(), "organization", organizationId, allotment.getCap());
    }

    @PostMapping("/{id}/allotments/groups")
    @ResponseStatus(HttpStatus.CREATED)
    public AllotmentDto allotGroup(@PathVariable Long id, @RequestBody GroupAllotmentRequest body) {
        var allotment = assessments.allotToGroup(id, body.groupId(), body.cap());
        return new AllotmentDto(allotment.getId(), "group", body.groupId(), allotment.getCap());
    }

    @PutMapping("/{id}/allotments/groups/{groupId}/cap")
    public AllotmentDto updateGroupCap(@PathVariable Long id, @PathVariable Long groupId,
                                       @RequestBody CapRequest body) {
        var allotment = assessments.updateGroupCap(id, groupId, body.cap());
        return new AllotmentDto(allotment.getId(), "group", groupId, allotment.getCap());
    }

    @PostMapping("/{id}/allotments/respondents")
    @ResponseStatus(HttpStatus.CREATED)
    public AllotmentDto allotRespondent(@PathVariable Long id, @RequestBody RespondentAllotmentRequest body) {
        var allotment = assessments.allotToRespondent(id, body.userId());
        return new AllotmentDto(allotment.getId(), "respondent", body.userId(), null);
    }
}
