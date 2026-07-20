package com.bodhpsychometric.bodhassess.v2.web;

import java.util.List;

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

import com.bodhpsychometric.bodhassess.domain.questionnaire.Questionnaire;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireChangeLog;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItem;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItemOption;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireSection;
import com.bodhpsychometric.bodhassess.domain.repository.OrganizationRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireChangeLogRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireItemRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireRepository;
import com.bodhpsychometric.bodhassess.domain.service.NotFoundException;
import com.bodhpsychometric.bodhassess.domain.service.QuestionnaireAuthoringService;
import com.bodhpsychometric.bodhassess.domain.service.QuestionnaireAuthoringService.PlacementValue;

@RestController
@RequestMapping("/api/v2/questionnaires")
public class QuestionnaireController {

    public record QuestionnaireRequest(String name, String shortName, String category, String vertical,
                                       String description, Integer durationMinutes, Long organizationId) {}
    public record SectionRequest(String title, Integer sortOrder) {}
    public record AddItemRequest(Long itemId, Long sectionId, Integer sortOrder) {}
    public record MoveItemRequest(Long sectionId, Integer sortOrder) {}
    public record ReplaceItemRequest(Long newItemId) {}
    public record ScoresRequest(List<PlacementValue> scores) {}
    public record OptionOrderRequest(List<Long> optionIds) {}
    public record DemographicFieldsRequest(List<Long> fieldIds) {}

    public record QuestionnaireDto(Long id, String name, String shortName, String category,
                                   String vertical, String description, Integer durationMinutes,
                                   Long organizationId) {
        static QuestionnaireDto from(Questionnaire q) {
            return new QuestionnaireDto(q.getId(), q.getName(), q.getShortName(), q.getCategory(),
                    q.getVertical(), q.getDescription(), q.getDurationMinutes(),
                    q.getOrganization() == null ? null : q.getOrganization().getId());
        }
    }

    public record SectionDto(Long id, String title, int sortOrder) {
        static SectionDto from(QuestionnaireSection s) {
            return new SectionDto(s.getId(), s.getTitle(), s.getSortOrder());
        }
    }

    public record OptionUsageDto(Long id, Long optionId, int displayOrder) {
        static OptionUsageDto from(QuestionnaireItemOption o) {
            return new OptionUsageDto(o.getId(), o.getOption().getId(), o.getDisplayOrder());
        }
    }

    public record UsageDto(Long id, Long itemId, Long sectionId, int sortOrder,
                           List<OptionUsageDto> options) {
        static UsageDto from(QuestionnaireItem u) {
            return new UsageDto(u.getId(), u.getItem().getId(),
                    u.getSection() == null ? null : u.getSection().getId(),
                    u.getSortOrder(),
                    u.getOptionUsages().stream().map(OptionUsageDto::from).toList());
        }
    }

    public record ChangeLogDto(Long id, String changeType, String details, String changedAt) {
        static ChangeLogDto from(QuestionnaireChangeLog c) {
            return new ChangeLogDto(c.getId(), c.getChangeType().name(), c.getDetails(),
                    c.getCreatedAt() == null ? null : c.getCreatedAt().toString());
        }
    }

    private final QuestionnaireAuthoringService authoring;
    private final QuestionnaireRepository questionnaireRepository;
    private final QuestionnaireItemRepository usageRepository;
    private final QuestionnaireChangeLogRepository changeLogRepository;
    private final OrganizationRepository organizationRepository;

    public QuestionnaireController(QuestionnaireAuthoringService authoring,
                                   QuestionnaireRepository questionnaireRepository,
                                   QuestionnaireItemRepository usageRepository,
                                   QuestionnaireChangeLogRepository changeLogRepository,
                                   OrganizationRepository organizationRepository) {
        this.authoring = authoring;
        this.questionnaireRepository = questionnaireRepository;
        this.usageRepository = usageRepository;
        this.changeLogRepository = changeLogRepository;
        this.organizationRepository = organizationRepository;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public QuestionnaireDto create(@RequestBody QuestionnaireRequest body) {
        Questionnaire questionnaire = new Questionnaire();
        apply(questionnaire, body);
        return QuestionnaireDto.from(authoring.create(questionnaire));
    }

    @PutMapping("/{id}")
    public QuestionnaireDto update(@PathVariable Long id, @RequestBody QuestionnaireRequest body) {
        return QuestionnaireDto.from(authoring.updateMetadata(id, q -> apply(q, body)));
    }

    @GetMapping
    public List<QuestionnaireDto> list() {
        return questionnaireRepository.findByDeletedAtIsNullOrderByNameAsc()
                .stream().map(QuestionnaireDto::from).toList();
    }

    @GetMapping("/{id}")
    public QuestionnaireDto get(@PathVariable Long id) {
        return QuestionnaireDto.from(authoring.get(id));
    }

    @GetMapping("/{id}/items")
    public List<UsageDto> items(@PathVariable Long id) {
        return usageRepository.findByQuestionnaireIdOrderBySortOrderAsc(id)
                .stream().map(UsageDto::from).toList();
    }

    @GetMapping("/{id}/change-log")
    public List<ChangeLogDto> changeLog(@PathVariable Long id) {
        return changeLogRepository.findByQuestionnaireIdOrderByCreatedAtDesc(id)
                .stream().map(ChangeLogDto::from).toList();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bin(@PathVariable Long id) {
        authoring.bin(id);
    }

    @PostMapping("/{id}/restore")
    public void restore(@PathVariable Long id) {
        authoring.restore(id);
    }

    // ── Sections ─────────────────────────────────────────────────────────

    @PostMapping("/{id}/sections")
    @ResponseStatus(HttpStatus.CREATED)
    public SectionDto addSection(@PathVariable Long id, @RequestBody SectionRequest body) {
        return SectionDto.from(authoring.addSection(id, body.title(),
                body.sortOrder() == null ? 0 : body.sortOrder()));
    }

    @PutMapping("/sections/{sectionId}")
    public SectionDto updateSection(@PathVariable Long sectionId, @RequestBody SectionRequest body) {
        return SectionDto.from(authoring.updateSection(sectionId, body.title(),
                body.sortOrder() == null ? 0 : body.sortOrder()));
    }

    @DeleteMapping("/sections/{sectionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSection(@PathVariable Long sectionId) {
        authoring.deleteSection(sectionId);
    }

    // ── Item usages ──────────────────────────────────────────────────────

    @PostMapping("/{id}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public UsageDto addItem(@PathVariable Long id, @RequestBody AddItemRequest body) {
        return UsageDto.from(authoring.addItem(id, body.itemId(), body.sectionId(),
                body.sortOrder() == null ? 0 : body.sortOrder()));
    }

    @DeleteMapping("/usages/{usageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeItem(@PathVariable Long usageId) {
        authoring.removeItem(usageId);
    }

    @PutMapping("/usages/{usageId}/move")
    public UsageDto moveItem(@PathVariable Long usageId, @RequestBody MoveItemRequest body) {
        return UsageDto.from(authoring.moveItem(usageId, body.sectionId(),
                body.sortOrder() == null ? 0 : body.sortOrder()));
    }

    /** Explicit repoint to a copy-on-write item version. */
    @PutMapping("/usages/{usageId}/replace")
    public UsageDto replaceItem(@PathVariable Long usageId, @RequestBody ReplaceItemRequest body) {
        return UsageDto.from(authoring.replaceItem(usageId, body.newItemId()));
    }

    @PutMapping("/usages/{usageId}/scores")
    public UsageDto setItemScores(@PathVariable Long usageId, @RequestBody ScoresRequest body) {
        return UsageDto.from(authoring.setItemScores(usageId, body.scores()));
    }

    @PutMapping("/option-usages/{optionUsageId}/scores")
    public OptionUsageDto setOptionScores(@PathVariable Long optionUsageId, @RequestBody ScoresRequest body) {
        return OptionUsageDto.from(authoring.setOptionScores(optionUsageId, body.scores()));
    }

    @PutMapping("/usages/{usageId}/option-order")
    public UsageDto setOptionOrder(@PathVariable Long usageId, @RequestBody OptionOrderRequest body) {
        return UsageDto.from(authoring.setOptionOrder(usageId, body.optionIds()));
    }

    // ── Demographic fields ───────────────────────────────────────────────

    @PutMapping("/{id}/demographic-fields")
    public void setDemographicFields(@PathVariable Long id, @RequestBody DemographicFieldsRequest body) {
        authoring.setDemographicFields(id, body.fieldIds());
    }

    // ── internals ────────────────────────────────────────────────────────

    private void apply(Questionnaire questionnaire, QuestionnaireRequest body) {
        questionnaire.setName(body.name());
        questionnaire.setShortName(body.shortName());
        questionnaire.setCategory(body.category());
        questionnaire.setVertical(body.vertical());
        questionnaire.setDescription(body.description());
        questionnaire.setDurationMinutes(body.durationMinutes());
        if (body.organizationId() != null) {
            questionnaire.setOrganization(organizationRepository
                    .findByIdAndDeletedAtIsNull(body.organizationId())
                    .orElseThrow(() -> new NotFoundException("Organization", body.organizationId())));
        } else {
            questionnaire.setOrganization(null);
        }
    }
}
