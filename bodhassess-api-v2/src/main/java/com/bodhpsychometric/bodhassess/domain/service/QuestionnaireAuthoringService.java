package com.bodhpsychometric.bodhassess.domain.service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.assessment.DemographicField;
import com.bodhpsychometric.bodhassess.domain.item.AnswerOption;
import com.bodhpsychometric.bodhassess.domain.item.Item;
import com.bodhpsychometric.bodhassess.domain.questionnaire.ItemUsageTraitScore;
import com.bodhpsychometric.bodhassess.domain.questionnaire.OptionUsageTraitScore;
import com.bodhpsychometric.bodhassess.domain.questionnaire.Questionnaire;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireChangeType;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireDemographicField;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItem;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItemOption;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireSection;
import com.bodhpsychometric.bodhassess.domain.repository.AnswerOptionRepository;
import com.bodhpsychometric.bodhassess.domain.repository.DemographicFieldRepository;
import com.bodhpsychometric.bodhassess.domain.repository.ItemRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireItemOptionRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireItemRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireSectionRepository;
import com.bodhpsychometric.bodhassess.domain.repository.TraitPlacementRepository;
import com.bodhpsychometric.bodhassess.domain.taxonomy.TraitPlacement;

/**
 * Authoring of live questionnaires. Every mutation is recorded in the
 * change log (there is no versioning — the log IS the accountability).
 *
 * Invariants owned here:
 *  - full option coverage: a usage always has exactly one option row per
 *    AnswerOption of its item, questionnaires can reorder but never hide;
 *  - usages are the only place meaning lives — items stay untouched;
 *  - replacing a usage's item (after a copy-on-write edit) migrates option
 *    order and scores by option position, drops rows for removed options,
 *    and creates unscored rows for new ones.
 */
@Service
@Transactional
public class QuestionnaireAuthoringService {

    public record PlacementValue(Long placementId, double value) {}

    private final QuestionnaireRepository questionnaireRepository;
    private final QuestionnaireSectionRepository sectionRepository;
    private final QuestionnaireItemRepository usageRepository;
    private final QuestionnaireItemOptionRepository optionUsageRepository;
    private final QuestionnaireDemographicFieldRepository demographicLinkRepository;
    private final DemographicFieldRepository demographicFieldRepository;
    private final ItemRepository itemRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final TraitPlacementRepository placementRepository;
    private final ChangeLogWriter changeLog;

    public QuestionnaireAuthoringService(QuestionnaireRepository questionnaireRepository,
                                         QuestionnaireSectionRepository sectionRepository,
                                         QuestionnaireItemRepository usageRepository,
                                         QuestionnaireItemOptionRepository optionUsageRepository,
                                         QuestionnaireDemographicFieldRepository demographicLinkRepository,
                                         DemographicFieldRepository demographicFieldRepository,
                                         ItemRepository itemRepository,
                                         AnswerOptionRepository answerOptionRepository,
                                         TraitPlacementRepository placementRepository,
                                         ChangeLogWriter changeLog) {
        this.questionnaireRepository = questionnaireRepository;
        this.sectionRepository = sectionRepository;
        this.usageRepository = usageRepository;
        this.optionUsageRepository = optionUsageRepository;
        this.demographicLinkRepository = demographicLinkRepository;
        this.demographicFieldRepository = demographicFieldRepository;
        this.itemRepository = itemRepository;
        this.answerOptionRepository = answerOptionRepository;
        this.placementRepository = placementRepository;
        this.changeLog = changeLog;
    }

    // ── Questionnaire lifecycle ──────────────────────────────────────────

    public Questionnaire create(Questionnaire questionnaire) {
        Questionnaire saved = questionnaireRepository.save(questionnaire);
        changeLog.log(saved, QuestionnaireChangeType.METADATA_UPDATED, Map.of("event", "created"));
        return saved;
    }

    public Questionnaire updateMetadata(Long id, java.util.function.Consumer<Questionnaire> mutator) {
        Questionnaire questionnaire = live(id);
        mutator.accept(questionnaire);
        changeLog.log(questionnaire, QuestionnaireChangeType.METADATA_UPDATED, Map.of("event", "updated"));
        return questionnaire;
    }

    public void bin(Long id) {
        live(id).moveToBin(OffsetDateTime.now());
    }

    public void restore(Long id) {
        questionnaireRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Questionnaire", id))
                .restoreFromBin();
    }

    @Transactional(readOnly = true)
    public Questionnaire get(Long id) {
        return live(id);
    }

    // ── Sections ─────────────────────────────────────────────────────────

    public QuestionnaireSection addSection(Long questionnaireId, String title, int sortOrder) {
        Questionnaire questionnaire = live(questionnaireId);
        QuestionnaireSection section = new QuestionnaireSection();
        section.setQuestionnaire(questionnaire);
        section.setTitle(title);
        section.setSortOrder(sortOrder);
        QuestionnaireSection saved = sectionRepository.save(section);
        changeLog.log(questionnaire, QuestionnaireChangeType.SECTION_CHANGED,
                Map.of("event", "added", "title", title));
        return saved;
    }

    public QuestionnaireSection updateSection(Long sectionId, String title, int sortOrder) {
        QuestionnaireSection section = sectionRepository.findById(sectionId)
                .orElseThrow(() -> new NotFoundException("QuestionnaireSection", sectionId));
        section.setTitle(title);
        section.setSortOrder(sortOrder);
        changeLog.log(section.getQuestionnaire(), QuestionnaireChangeType.SECTION_CHANGED,
                Map.of("event", "updated", "sectionId", sectionId, "title", title));
        return section;
    }

    /** Deleting a section drops its questions back to unsectioned — never out of the questionnaire. */
    public void deleteSection(Long sectionId) {
        QuestionnaireSection section = sectionRepository.findById(sectionId)
                .orElseThrow(() -> new NotFoundException("QuestionnaireSection", sectionId));
        for (QuestionnaireItem usage : usageRepository.findBySectionIdOrderBySortOrderAsc(sectionId)) {
            usage.setSection(null);
        }
        Questionnaire questionnaire = section.getQuestionnaire();
        sectionRepository.delete(section);
        changeLog.log(questionnaire, QuestionnaireChangeType.SECTION_CHANGED,
                Map.of("event", "deleted", "sectionId", sectionId));
    }

    // ── Item usages ──────────────────────────────────────────────────────

    public QuestionnaireItem addItem(Long questionnaireId, Long itemId, Long sectionId, int sortOrder) {
        Questionnaire questionnaire = live(questionnaireId);
        Item item = itemRepository.findByIdAndDeletedAtIsNull(itemId)
                .orElseThrow(() -> new NotFoundException("Item", itemId));
        if (usageRepository.existsByQuestionnaireIdAndItemId(questionnaireId, itemId)) {
            throw new ConflictException("Item " + itemId + " is already in questionnaire " + questionnaireId);
        }

        QuestionnaireItem usage = new QuestionnaireItem();
        usage.setQuestionnaire(questionnaire);
        usage.setItem(item);
        usage.setSortOrder(sortOrder);
        if (sectionId != null) {
            usage.setSection(requireSectionOf(questionnaireId, sectionId));
        }
        // Full option coverage: one row per option, display order = authoring order.
        for (AnswerOption option : answerOptionRepository.findByItemIdOrderBySortOrderAsc(itemId)) {
            QuestionnaireItemOption row = new QuestionnaireItemOption();
            row.setOption(option);
            row.setDisplayOrder(option.getSortOrder());
            usage.addOptionUsage(row);
        }
        QuestionnaireItem saved = usageRepository.save(usage);
        changeLog.log(questionnaire, QuestionnaireChangeType.ITEM_ADDED,
                Map.of("itemId", itemId, "usageId", saved.getId()));
        return saved;
    }

    /** Deletes the usage row and its children only — the item stays in the bank. */
    public void removeItem(Long usageId) {
        QuestionnaireItem usage = usage(usageId);
        Questionnaire questionnaire = usage.getQuestionnaire();
        Long itemId = usage.getItem().getId();
        usageRepository.delete(usage);
        changeLog.log(questionnaire, QuestionnaireChangeType.ITEM_REMOVED,
                Map.of("itemId", itemId, "usageId", usageId));
    }

    public QuestionnaireItem moveItem(Long usageId, Long sectionId, int sortOrder) {
        QuestionnaireItem usage = usage(usageId);
        usage.setSortOrder(sortOrder);
        usage.setSection(sectionId == null ? null
                : requireSectionOf(usage.getQuestionnaire().getId(), sectionId));
        changeLog.log(usage.getQuestionnaire(), QuestionnaireChangeType.ITEM_REORDERED,
                Map.of("usageId", usageId, "sortOrder", sortOrder));
        return usage;
    }

    /**
     * Repoint this questionnaire's usage to another item version (the
     * explicit authoring act after a copy-on-write edit). Option order and
     * scores migrate by option position; removed options drop, new options
     * arrive unscored.
     */
    public QuestionnaireItem replaceItem(Long usageId, Long newItemId) {
        QuestionnaireItem usage = usage(usageId);
        Item oldItem = usage.getItem();
        Item newItem = itemRepository.findByIdAndDeletedAtIsNull(newItemId)
                .orElseThrow(() -> new NotFoundException("Item", newItemId));
        if (oldItem.getId().equals(newItemId)) {
            return usage;
        }
        if (usageRepository.existsByQuestionnaireIdAndItemId(usage.getQuestionnaire().getId(), newItemId)) {
            throw new ConflictException("Item " + newItemId + " is already in this questionnaire");
        }

        // Snapshot old per-option state keyed by option position.
        Map<Integer, QuestionnaireItemOption> oldByPosition = new HashMap<>();
        for (QuestionnaireItemOption row : usage.getOptionUsages()) {
            oldByPosition.put(row.getOption().getSortOrder(), row);
        }

        usage.setItem(newItem);
        usage.getOptionUsages().clear();   // orphanRemoval deletes old rows + their scores

        for (AnswerOption option : answerOptionRepository.findByItemIdOrderBySortOrderAsc(newItemId)) {
            QuestionnaireItemOption row = new QuestionnaireItemOption();
            row.setOption(option);
            QuestionnaireItemOption previous = oldByPosition.get(option.getSortOrder());
            row.setDisplayOrder(previous != null ? previous.getDisplayOrder() : option.getSortOrder());
            if (previous != null) {
                for (OptionUsageTraitScore old : previous.getTraitScores()) {
                    OptionUsageTraitScore carried = new OptionUsageTraitScore();
                    carried.setPlacement(old.getPlacement());
                    carried.setValue(old.getValue());
                    row.addTraitScore(carried);
                }
            }
            usage.addOptionUsage(row);
        }
        changeLog.log(usage.getQuestionnaire(), QuestionnaireChangeType.ITEM_REPLACED,
                Map.of("usageId", usageId, "oldItemId", oldItem.getId(), "newItemId", newItemId));
        return usage;
    }

    // ── Per-usage scoring configuration ──────────────────────────────────

    public QuestionnaireItem setItemScores(Long usageId, List<PlacementValue> scores) {
        QuestionnaireItem usage = usage(usageId);
        usage.getTraitScores().clear();
        for (PlacementValue pv : dedupe(scores)) {
            ItemUsageTraitScore score = new ItemUsageTraitScore();
            score.setPlacement(livePlacement(pv.placementId()));
            score.setValue(pv.value());
            usage.addTraitScore(score);
        }
        changeLog.log(usage.getQuestionnaire(), QuestionnaireChangeType.SCORE_CHANGED,
                Map.of("usageId", usageId, "level", "item", "count", scores == null ? 0 : scores.size()));
        return usage;
    }

    public QuestionnaireItemOption setOptionScores(Long optionUsageId, List<PlacementValue> scores) {
        QuestionnaireItemOption optionUsage = optionUsageRepository.findById(optionUsageId)
                .orElseThrow(() -> new NotFoundException("QuestionnaireItemOption", optionUsageId));
        optionUsage.getTraitScores().clear();
        for (PlacementValue pv : dedupe(scores)) {
            OptionUsageTraitScore score = new OptionUsageTraitScore();
            score.setPlacement(livePlacement(pv.placementId()));
            score.setValue(pv.value());
            optionUsage.addTraitScore(score);
        }
        changeLog.log(optionUsage.getUsage().getQuestionnaire(), QuestionnaireChangeType.SCORE_CHANGED,
                Map.of("optionUsageId", optionUsageId, "level", "option",
                        "count", scores == null ? 0 : scores.size()));
        return optionUsage;
    }

    /** Reorder options for THIS questionnaire only — full coverage required, no hiding. */
    public QuestionnaireItem setOptionOrder(Long usageId, List<Long> optionIdsInOrder) {
        QuestionnaireItem usage = usage(usageId);
        List<QuestionnaireItemOption> rows = usage.getOptionUsages();
        if (optionIdsInOrder == null || optionIdsInOrder.size() != rows.size()) {
            throw new ValidationException("Order must list every option of the item exactly once ("
                    + rows.size() + " expected)");
        }
        Map<Long, QuestionnaireItemOption> byOptionId = new HashMap<>();
        for (QuestionnaireItemOption row : rows) {
            byOptionId.put(row.getOption().getId(), row);
        }
        int order = 0;
        for (Long optionId : optionIdsInOrder) {
            QuestionnaireItemOption row = byOptionId.remove(optionId);
            if (row == null) {
                throw new ValidationException("Option " + optionId + " does not belong to usage " + usageId);
            }
            row.setDisplayOrder(order++);
        }
        changeLog.log(usage.getQuestionnaire(), QuestionnaireChangeType.OPTION_ORDER_CHANGED,
                Map.of("usageId", usageId));
        return usage;
    }

    // ── Demographic fields ───────────────────────────────────────────────

    public List<QuestionnaireDemographicField> setDemographicFields(Long questionnaireId, List<Long> fieldIdsInOrder) {
        Questionnaire questionnaire = live(questionnaireId);
        questionnaire.getDemographicFields().clear();
        List<QuestionnaireDemographicField> result = new ArrayList<>();
        int order = 0;
        for (Long fieldId : fieldIdsInOrder == null ? List.<Long>of() : fieldIdsInOrder) {
            DemographicField field = demographicFieldRepository.findByIdAndDeletedAtIsNull(fieldId)
                    .orElseThrow(() -> new NotFoundException("DemographicField", fieldId));
            QuestionnaireDemographicField link = new QuestionnaireDemographicField();
            link.setField(field);
            link.setSortOrder(order++);
            questionnaire.addDemographicField(link);
            result.add(link);
        }
        changeLog.log(questionnaire, QuestionnaireChangeType.DEMOGRAPHICS_CHANGED,
                Map.of("fieldIds", fieldIdsInOrder == null ? List.of() : fieldIdsInOrder));
        return result;
    }

    // ── internals ────────────────────────────────────────────────────────

    private List<PlacementValue> dedupe(List<PlacementValue> scores) {
        if (scores == null) return List.of();
        Map<Long, PlacementValue> byPlacement = new LinkedHashMap<>();
        for (PlacementValue pv : scores) {
            byPlacement.put(pv.placementId(), pv);   // last write wins, unique(usage, placement) holds
        }
        return List.copyOf(byPlacement.values());
    }

    private QuestionnaireSection requireSectionOf(Long questionnaireId, Long sectionId) {
        QuestionnaireSection section = sectionRepository.findById(sectionId)
                .orElseThrow(() -> new NotFoundException("QuestionnaireSection", sectionId));
        if (!section.getQuestionnaire().getId().equals(questionnaireId)) {
            throw new ValidationException("Section " + sectionId + " belongs to a different questionnaire");
        }
        return section;
    }

    private Questionnaire live(Long id) {
        return questionnaireRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("Questionnaire", id));
    }

    private QuestionnaireItem usage(Long usageId) {
        return usageRepository.findById(usageId)
                .orElseThrow(() -> new NotFoundException("QuestionnaireItem", usageId));
    }

    private TraitPlacement livePlacement(Long id) {
        return placementRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("TraitPlacement", id));
    }
}
