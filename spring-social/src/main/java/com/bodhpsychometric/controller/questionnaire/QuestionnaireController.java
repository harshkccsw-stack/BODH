package com.bodhpsychometric.controller.questionnaire;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.QuestionnaireDemographicFieldRequest;
import com.bodhpsychometric.dto.QuestionnaireDemographicFieldResponse;
import com.bodhpsychometric.dto.QuestionnaireQuestionRequest;
import com.bodhpsychometric.dto.QuestionnaireRequest;
import com.bodhpsychometric.dto.QuestionnaireResponse;
import com.bodhpsychometric.dto.SectionRequest;
import com.bodhpsychometric.dto.SectionResponse;
import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.questionnaire.Section;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.demographics.DemographicFieldRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireRepository;
import com.bodhpsychometric.repository.questionnaire.SectionRepository;

import jakarta.validation.Valid;

/**
 * Catalog CRUD for questionnaires — the versionless replacement for the old
 * parent/version model: one row per questionnaire, edited live. Question
 * authoring has its own flow; this controller only manages catalog entries.
 * Transactional at class level: questionCount walks the lazy questions list.
 */
@RestController
@RequestMapping("/api/questionnaire")
@Transactional
public class QuestionnaireController {

    @Autowired
    private QuestionnaireRepository questionnaireRepository;

    @Autowired
    private QuestionnaireDemographicFieldRepository questionnaireDemographicFieldRepository;

    @Autowired
    private DemographicFieldRepository demographicFieldRepository;

    @Autowired
    private SectionRepository sectionRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private QuestionnaireQuestionRepository questionnaireQuestionRepository;

    @Autowired
    private AssessmentRepository assessmentRepository;

    private int questionCountOf(Long questionnaireId) {
        return (int) questionnaireQuestionRepository.countByQuestionnaireQuestionnaireId(questionnaireId);
    }

    @GetMapping("/getAll")
    public List<QuestionnaireResponse> getAllQuestionnaires() {
        return questionnaireRepository.findAll().stream()
                .map(q -> QuestionnaireResponse.from(q, questionCountOf(q.getQuestionnaireId())))
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<QuestionnaireResponse> getQuestionnaireById(@PathVariable Long id) {
        return questionnaireRepository.findById(id)
                .map(q -> ResponseEntity.ok(QuestionnaireResponse.from(q, questionCountOf(id))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<QuestionnaireResponse> createQuestionnaire(
            @Valid @RequestBody QuestionnaireRequest request) {
        Questionnaire q = new Questionnaire();
        apply(q, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(QuestionnaireResponse.from(questionnaireRepository.save(q), 0));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<QuestionnaireResponse> updateQuestionnaire(@PathVariable Long id,
            @Valid @RequestBody QuestionnaireRequest request) {
        return questionnaireRepository.findById(id)
                .map(q -> {
                    apply(q, request);
                    return ResponseEntity.ok(
                            QuestionnaireResponse.from(questionnaireRepository.save(q), questionCountOf(id)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteQuestionnaire(@PathVariable Long id) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        // Assessments FK-reference the questionnaire they offer; deleting the
        // questionnaire under them would orphan live configuration.
        long assessments = assessmentRepository.countByQuestionnaireQuestionnaireId(id);
        if (assessments > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                    "questionnaire backs " + assessments + " assessment(s) — delete those assessments first"));
        }
        // Placements, form config and sections belong to this questionnaire
        // and go with it; bank questions and registry fields are untouched.
        // Flush placements before sections so nothing FK-blocks.
        questionnaireQuestionRepository.deleteByQuestionnaireQuestionnaireId(id);
        questionnaireDemographicFieldRepository.deleteByQuestionnaireQuestionnaireId(id);
        questionnaireQuestionRepository.flush();
        questionnaireDemographicFieldRepository.flush();
        sectionRepository.deleteAll(sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySectionIdAsc(id));
        sectionRepository.flush();
        questionnaireRepository.delete(questionnaire);
        return ResponseEntity.noContent().build();
    }

    /** The questionnaire's demographic form, in display order. */
    @GetMapping("/{id}/demographic-fields")
    public ResponseEntity<List<QuestionnaireDemographicFieldResponse>> getDemographicFields(@PathVariable Long id) {
        if (!questionnaireRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(
                questionnaireDemographicFieldRepository
                        .findByQuestionnaireQuestionnaireIdOrderBySortOrderAsc(id).stream()
                        .map(QuestionnaireDemographicFieldResponse::from)
                        .toList());
    }

    /**
     * Replace the questionnaire's demographic form with exactly this list —
     * position becomes sortOrder, an empty list clears the form. Validated
     * up front so a bad entry never leaves a half-replaced mapping.
     */
    @PutMapping("/{id}/demographic-fields")
    public ResponseEntity<?> setDemographicFields(@PathVariable Long id,
            @RequestBody List<@Valid QuestionnaireDemographicFieldRequest> entries) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        Set<Long> seen = new HashSet<>();
        List<DemographicField> fields = new ArrayList<>();
        for (QuestionnaireDemographicFieldRequest entry : entries) {
            if (entry.demographicFieldId() == null || !seen.add(entry.demographicFieldId())) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "missing or duplicate demographicFieldId"));
            }
            DemographicField field = demographicFieldRepository.findById(entry.demographicFieldId()).orElse(null);
            if (field == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "unknown demographicFieldId " + entry.demographicFieldId()));
            }
            fields.add(field);
        }
        questionnaireDemographicFieldRepository.deleteByQuestionnaireQuestionnaireId(id);
        // Flush the deletes now: Hibernate orders INSERTs before DELETEs at
        // commit, which would trip the unique (questionnaireId, fieldId) pair
        // for every entry that stays selected.
        questionnaireDemographicFieldRepository.flush();
        List<QuestionnaireDemographicField> rows = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            QuestionnaireDemographicField row = new QuestionnaireDemographicField();
            row.setQuestionnaire(questionnaire);
            row.setDemographicField(fields.get(i));
            row.setRequired(entries.get(i).required());
            row.setSortOrder(i);
            rows.add(row);
        }
        return ResponseEntity.ok(
                questionnaireDemographicFieldRepository.saveAll(rows).stream()
                        .map(QuestionnaireDemographicFieldResponse::from)
                        .toList());
    }

    // ── Sections ──────────────────────────────────────────────────────────

    @GetMapping("/{id}/sections")
    public ResponseEntity<List<SectionResponse>> getSections(@PathVariable Long id) {
        if (!questionnaireRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(
                sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id).stream()
                        .map(SectionResponse::from)
                        .toList());
    }

    @PostMapping("/{id}/sections")
    public ResponseEntity<SectionResponse> createSection(@PathVariable Long id,
            @Valid @RequestBody SectionRequest request) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        Section section = new Section();
        section.setQuestionnaire(questionnaire);
        section.setName(request.name().trim());
        section.setInstruction(request.instruction());
        // Appended last. sortOrder is kept dense by reorder/delete, so the
        // count IS the next free position — no MAX(sortOrder) + 1 needed.
        section.setSortOrder(
                sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id).size());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(SectionResponse.from(sectionRepository.save(section)));
    }

    /**
     * Renames a section and/or rewrites its instruction. Position is NOT
     * touched — that is what the order endpoint is for — so the report tag
     * letters, which follow position rather than name, cannot move here.
     * A blank instruction comes back as null rather than "".
     */
    @PutMapping("/{id}/sections/{sectionId}")
    public ResponseEntity<SectionResponse> updateSection(@PathVariable Long id, @PathVariable Long sectionId,
            @Valid @RequestBody SectionRequest request) {
        Section section = sectionRepository.findById(sectionId).orElse(null);
        if (section == null || !section.getQuestionnaire().getQuestionnaireId().equals(id)) {
            return ResponseEntity.notFound().build();
        }
        section.setName(request.name().trim());
        section.setInstruction(
                request.instruction() == null || request.instruction().isBlank() ? null : request.instruction());
        return ResponseEntity.ok(SectionResponse.from(sectionRepository.save(section)));
    }

    /**
     * Replaces the display order of this questionnaire's sections: the body
     * is every sectionId, in the order the author wants them. It must be the
     * COMPLETE set — a partial list would leave the rest holding stale
     * positions, so anything missing, extra or duplicated is a 400 rather
     * than a half-applied order.
     *
     * Because the Section_A/B/C letters are stamped from display order, this
     * re-stamps every placement's report tag. Without that, moving Part B
     * above Part A would leave its questions tagged Section_B_* until the
     * author happened to re-save the question list.
     *
     * Mapped BEFORE the {sectionId} variant in this file, but it does not
     * rely on that: Spring matches the literal "order" segment ahead of a
     * path variable.
     */
    @PutMapping("/{id}/sections/order")
    public ResponseEntity<?> reorderSections(@PathVariable Long id, @RequestBody List<Long> sectionIds) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        List<Section> sections = sectionRepository
                .findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id);
        Map<Long, Section> byId = new java.util.HashMap<>();
        for (Section s : sections) {
            byId.put(s.getSectionId(), s);
        }
        Set<Long> seen = new HashSet<>();
        for (Long sectionId : sectionIds) {
            if (sectionId == null || !byId.containsKey(sectionId) || !seen.add(sectionId)) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "sectionIds must list each of this questionnaire's sections exactly once"));
            }
        }
        if (seen.size() != sections.size()) {
            return ResponseEntity.badRequest().body(Map.of("message",
                    "sectionIds must list all " + sections.size() + " section(s) of this questionnaire — got "
                            + seen.size()));
        }
        for (int i = 0; i < sectionIds.size(); i++) {
            byId.get(sectionIds.get(i)).setSortOrder(i);
        }
        sectionRepository.flush();
        restampQuestionTags(questionnaire);
        return ResponseEntity.ok(
                sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id).stream()
                        .map(SectionResponse::from)
                        .toList());
    }

    /**
     * Deletes a section. Its questions are NOT deleted — they detach from
     * the section (staying attached to the questionnaire) so the author can
     * re-place them; Section itself has no cascade by design.
     *
     * The survivors are renumbered so sortOrder stays dense, and the report
     * tags are re-stamped because every section after this one just moved up
     * a letter. The detached questions have their tag CLEARED: they are in no
     * section, so there is no letter to give them, and keeping the old one
     * would duplicate a tag now held by whichever section inherited that
     * letter — the tag is an export column header, so a duplicate is worse
     * than a blank. Re-placing the question stamps it again.
     */
    @DeleteMapping("/{id}/sections/{sectionId}")
    public ResponseEntity<Void> deleteSection(@PathVariable Long id, @PathVariable Long sectionId) {
        Section section = sectionRepository.findById(sectionId).orElse(null);
        if (section == null || !section.getQuestionnaire().getQuestionnaireId().equals(id)) {
            return ResponseEntity.notFound().build();
        }
        for (QuestionnaireQuestion placement : questionnaireQuestionRepository.findBySectionSectionId(sectionId)) {
            placement.setSection(null);
            placement.setQuestionTag(null);
        }
        questionnaireQuestionRepository.flush();
        sectionRepository.delete(section);
        sectionRepository.flush();
        List<Section> remaining = sectionRepository
                .findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id);
        for (int i = 0; i < remaining.size(); i++) {
            remaining.get(i).setSortOrder(i);
        }
        sectionRepository.flush();
        restampQuestionTags(section.getQuestionnaire());
        return ResponseEntity.noContent().build();
    }

    /**
     * Re-applies the report tags of every placement in the questionnaire from
     * the CURRENT section order. Called whenever section order changes;
     * setQuestions does its own stamping on the rows it writes.
     */
    private void restampQuestionTags(Questionnaire questionnaire) {
        Long id = questionnaire.getQuestionnaireId();
        assignQuestionTags(questionnaire.isHasSections(),
                sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id),
                questionnaireQuestionRepository.findInDisplayOrder(id));
    }

    // ── Question mapping ──────────────────────────────────────────────────

    /**
     * Replace this questionnaire's placements with exactly this list. A bank
     * question may appear in MANY questionnaires — the duplicate check (and
     * the DB's unique pair) only forbids the same question twice in THIS one.
     * An empty list clears the questionnaire. Every placement gets its report
     * tag ("Section_A_Q_1" / "Q_1") stamped here — this PUT is the only
     * writer of placements, so tags always mirror the saved layout.
     */
    @PutMapping("/{id}/questions")
    public ResponseEntity<?> setQuestions(@PathVariable Long id,
            @RequestBody List<@Valid QuestionnaireQuestionRequest> entries) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        // Display order, because assignQuestionTags letters sections from it.
        List<Section> sections = sectionRepository
                .findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(id);
        Set<Long> validSections = new HashSet<>();
        Map<Long, Section> sectionById = new java.util.HashMap<>();
        for (Section s : sections) {
            validSections.add(s.getSectionId());
            sectionById.put(s.getSectionId(), s);
        }

        Set<Long> seen = new HashSet<>();
        List<Question> resolved = new ArrayList<>();
        for (QuestionnaireQuestionRequest entry : entries) {
            if (entry.questionId() == null || !seen.add(entry.questionId())) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "missing or duplicate questionId — a question can appear only once per questionnaire"));
            }
            if (questionnaire.isHasSections()) {
                if (entry.sectionId() == null || !validSections.contains(entry.sectionId())) {
                    return ResponseEntity.badRequest().body(Map.of("message",
                            "sectionId is required and must belong to this questionnaire (questionId "
                                    + entry.questionId() + ")"));
                }
            } else if (entry.sectionId() != null) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "this questionnaire has no sections — sectionId must be null"));
            }
            Question question = questionRepository.findById(entry.questionId()).orElse(null);
            if (question == null) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "unknown questionId " + entry.questionId()));
            }
            resolved.add(question);
        }

        questionnaireQuestionRepository.deleteByQuestionnaireQuestionnaireId(id);
        // Flush the deletes now: Hibernate orders INSERTs before DELETEs at
        // commit, which would trip the unique (questionnaireId, questionId)
        // pair for every question that stays placed.
        questionnaireQuestionRepository.flush();
        List<QuestionnaireQuestion> rows = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            QuestionnaireQuestionRequest entry = entries.get(i);
            QuestionnaireQuestion row = new QuestionnaireQuestion();
            row.setQuestionnaire(questionnaire);
            row.setQuestion(resolved.get(i));
            row.setSection(entry.sectionId() == null ? null : sectionById.get(entry.sectionId()));
            row.setSortOrder(entry.sortOrder() == null ? i : entry.sortOrder());
            rows.add(row);
        }
        assignQuestionTags(questionnaire.isHasSections(), sections, rows);
        questionnaireQuestionRepository.saveAll(rows);
        return ResponseEntity.ok(Map.of("attached", entries.size()));
    }

    /**
     * Stamps every placement with its questionnaire-local report tag.
     * Sectioned: sections that actually hold questions are lettered A, B, …
     * in display order (the author's sortOrder — empty sections never
     * render, so they claim no letter), and questions count 1..n inside
     * their section by sortOrder. Flat: Q_1..Q_n across the questionnaire.
     */
    private void assignQuestionTags(boolean hasSections, List<Section> sectionsInDisplayOrder,
            List<QuestionnaireQuestion> rows) {
        if (!hasSections) {
            List<QuestionnaireQuestion> ordered = new ArrayList<>(rows);
            ordered.sort(java.util.Comparator.comparingInt(QuestionnaireQuestion::getSortOrder));
            for (int i = 0; i < ordered.size(); i++) {
                ordered.get(i).setQuestionTag("Q_" + (i + 1));
            }
            return;
        }
        int letterIndex = 0;
        for (Section section : sectionsInDisplayOrder) {
            List<QuestionnaireQuestion> inSection = rows.stream()
                    .filter(r -> r.getSection() != null
                            && r.getSection().getSectionId().equals(section.getSectionId()))
                    .sorted(java.util.Comparator.comparingInt(QuestionnaireQuestion::getSortOrder))
                    .toList();
            if (inSection.isEmpty()) {
                continue;
            }
            String letter = sectionLetter(letterIndex++);
            for (int i = 0; i < inSection.size(); i++) {
                inSection.get(i).setQuestionTag("Section_" + letter + "_Q_" + (i + 1));
            }
        }
    }

    /** 0 → A … 25 → Z, 26 → AA — spreadsheet-style, should a questionnaire ever exceed 26 sections. */
    private String sectionLetter(int index) {
        StringBuilder sb = new StringBuilder();
        for (int n = index; n >= 0; n = n / 26 - 1) {
            sb.insert(0, (char) ('A' + n % 26));
        }
        return sb.toString();
    }

    private void apply(Questionnaire q, QuestionnaireRequest request) {
        q.setName(request.name().trim());
        q.setShortName(request.shortName());
        q.setCategory(request.category());
        q.setVertical(request.vertical());
        q.setDescription(request.description());
        q.setDurationMinutes(request.durationMinutes());
        q.setGeneralInstruction(request.generalInstruction());
        q.setHasSections(Boolean.TRUE.equals(request.hasSections()));
    }
}
