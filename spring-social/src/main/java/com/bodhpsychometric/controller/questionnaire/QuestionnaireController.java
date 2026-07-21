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
import com.bodhpsychometric.dto.QuestionnaireRequest;
import com.bodhpsychometric.dto.QuestionnaireResponse;
import com.bodhpsychometric.model.demographics.DemographicField;
import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.repository.demographics.DemographicFieldRepository;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireRepository;

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
        if (!questionnaireRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        // Questions and their options cascade with the questionnaire. Sections
        // deliberately do not — a questionnaire that still has Section rows
        // will be refused by the FK until its sections are removed.
        questionnaireRepository.deleteById(id);
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
