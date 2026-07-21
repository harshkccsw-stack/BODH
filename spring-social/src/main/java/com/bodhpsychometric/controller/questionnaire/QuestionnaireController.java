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
import com.bodhpsychometric.model.questionnaire.Section;
import com.bodhpsychometric.repository.demographics.DemographicFieldRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
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

    @GetMapping("/getAll")
    public List<QuestionnaireResponse> getAllQuestionnaires() {
        return questionnaireRepository.findAll().stream()
                .map(QuestionnaireResponse::from)
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<QuestionnaireResponse> getQuestionnaireById(@PathVariable Long id) {
        return questionnaireRepository.findById(id)
                .map(q -> ResponseEntity.ok(QuestionnaireResponse.from(q)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<QuestionnaireResponse> createQuestionnaire(
            @Valid @RequestBody QuestionnaireRequest request) {
        Questionnaire q = new Questionnaire();
        apply(q, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(QuestionnaireResponse.from(questionnaireRepository.save(q)));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<QuestionnaireResponse> updateQuestionnaire(@PathVariable Long id,
            @Valid @RequestBody QuestionnaireRequest request) {
        return questionnaireRepository.findById(id)
                .map(q -> {
                    apply(q, request);
                    return ResponseEntity.ok(QuestionnaireResponse.from(questionnaireRepository.save(q)));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<Void> deleteQuestionnaire(@PathVariable Long id) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        // Questions are independent bank items: detach them (FK to null) so
        // they survive the questionnaire. Sections still FK-block until
        // removed.
        for (Question question : List.copyOf(questionnaire.getQuestions())) {
            question.setQuestionnaire(null);
        }
        questionnaire.getQuestions().clear();
        // The demographic-field form config belongs to this questionnaire and
        // goes with it — the registry fields themselves are untouched. Flush
        // so the mapping rows are gone before the questionnaire row delete.
        questionnaireDemographicFieldRepository.deleteByQuestionnaireQuestionnaireId(id);
        questionnaireDemographicFieldRepository.flush();
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
            @RequestBody List<QuestionnaireDemographicFieldRequest> entries) {
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
                sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySectionIdAsc(id).stream()
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
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(SectionResponse.from(sectionRepository.save(section)));
    }

    /**
     * Deletes a section. Its questions are NOT deleted — they detach from
     * the section (staying attached to the questionnaire) so the author can
     * re-place them; Section itself has no cascade by design.
     */
    @DeleteMapping("/{id}/sections/{sectionId}")
    public ResponseEntity<Void> deleteSection(@PathVariable Long id, @PathVariable Long sectionId) {
        Section section = sectionRepository.findById(sectionId).orElse(null);
        if (section == null || !section.getQuestionnaire().getQuestionnaireId().equals(id)) {
            return ResponseEntity.notFound().build();
        }
        for (Question question : questionRepository.findBySectionSectionId(sectionId)) {
            question.setSection(null);
        }
        questionRepository.flush();
        sectionRepository.delete(section);
        return ResponseEntity.noContent().build();
    }

    // ── Question mapping ──────────────────────────────────────────────────

    /**
     * Replace which bank questions make up this questionnaire, where, and in
     * what order. Full-state PUT: entries not previously attached are
     * attached, previously attached questions missing from the list are
     * detached back to the bank. Questions attached to a DIFFERENT
     * questionnaire are refused, never stolen.
     */
    @PutMapping("/{id}/questions")
    public ResponseEntity<?> setQuestions(@PathVariable Long id,
            @RequestBody List<QuestionnaireQuestionRequest> entries) {
        Questionnaire questionnaire = questionnaireRepository.findById(id).orElse(null);
        if (questionnaire == null) {
            return ResponseEntity.notFound().build();
        }
        Set<Long> validSections = new HashSet<>();
        Map<Long, Section> sectionById = new java.util.HashMap<>();
        for (Section s : sectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySectionIdAsc(id)) {
            validSections.add(s.getSectionId());
            sectionById.put(s.getSectionId(), s);
        }

        Set<Long> seen = new HashSet<>();
        List<Question> resolved = new ArrayList<>();
        for (QuestionnaireQuestionRequest entry : entries) {
            if (entry.questionId() == null || !seen.add(entry.questionId())) {
                return ResponseEntity.badRequest().body(Map.of("message", "missing or duplicate questionId"));
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
            Long attachedTo = question.getQuestionnaire() == null ? null
                    : question.getQuestionnaire().getQuestionnaireId();
            if (attachedTo != null && !attachedTo.equals(id)) {
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message",
                        "question " + entry.questionId() + " is attached to another questionnaire"));
            }
            resolved.add(question);
        }

        // Detach everything currently attached but absent from the new list.
        for (Question attached : questionRepository
                .findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionIdAsc(id)) {
            if (!seen.contains(attached.getQuestionId())) {
                attached.setQuestionnaire(null);
                attached.setSection(null);
                attached.setSortOrder(null);
            }
        }
        for (int i = 0; i < entries.size(); i++) {
            QuestionnaireQuestionRequest entry = entries.get(i);
            Question question = resolved.get(i);
            question.setQuestionnaire(questionnaire);
            question.setSection(entry.sectionId() == null ? null : sectionById.get(entry.sectionId()));
            question.setSortOrder(entry.sortOrder() == null ? i : entry.sortOrder());
        }
        return ResponseEntity.ok(Map.of("attached", entries.size()));
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
