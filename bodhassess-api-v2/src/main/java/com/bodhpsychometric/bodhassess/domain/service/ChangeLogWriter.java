package com.bodhpsychometric.bodhassess.domain.service;

import java.util.Map;

import org.springframework.stereotype.Component;

import com.bodhpsychometric.bodhassess.domain.questionnaire.Questionnaire;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireChangeLog;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireChangeType;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireChangeLogRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The one write path into the questionnaire change log. Actor + timestamp
 * come from auditing (createdBy/createdAt); this only shapes the details
 * payload. Append-only: there is deliberately no update or delete method.
 */
@Component
public class ChangeLogWriter {

    private final QuestionnaireChangeLogRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ChangeLogWriter(QuestionnaireChangeLogRepository repository) {
        this.repository = repository;
    }

    public void log(Questionnaire questionnaire, QuestionnaireChangeType type, Map<String, Object> details) {
        QuestionnaireChangeLog entry = new QuestionnaireChangeLog();
        entry.setQuestionnaire(questionnaire);
        entry.setChangeType(type);
        try {
            entry.setDetails(objectMapper.writeValueAsString(details));
        } catch (JsonProcessingException e) {
            entry.setDetails("{\"serializationError\":\"" + e.getMessage() + "\"}");
        }
        repository.save(entry);
    }
}
