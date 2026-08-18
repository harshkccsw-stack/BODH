package com.bodhpsychometric.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalQuestionnaireContent;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.repository.demographics.QuestionnaireDemographicFieldRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireRepository;

/**
 * The portal content cache: hands out {@link PortalQuestionnaireContent} from
 * Redis when it can, from MySQL when it must, and is the single place
 * authoring writes call to evict. The read path is
 * cache → build (3 MySQL queries + lazy loads) → cache-fill, so ten thousand
 * concurrent attempts of one assessment cost one build per day, not one per
 * request — and with Redis away every call simply IS the build, which is the
 * pre-cache behaviour.
 *
 * <p>Eviction is EXPLICIT on every authoring write (questionnaire, sections,
 * placements, question edits, demographic form) with the 1-day TTL as the
 * backstop — the portal never knowingly serves stale content. Assessment-level
 * settings need no eviction: they are not in the cached half at all (see
 * PortalAssessmentDetailResponse).
 */
@Service
public class PortalContentService {

    private final PortalRedisStore redis;
    private final QuestionnaireRepository questionnaires;
    private final QuestionnaireQuestionRepository placements;
    private final QuestionnaireDemographicFieldRepository demographicMappings;

    public PortalContentService(PortalRedisStore redis,
            QuestionnaireRepository questionnaires,
            QuestionnaireQuestionRepository placements,
            QuestionnaireDemographicFieldRepository demographicMappings) {
        this.redis = redis;
        this.questionnaires = questionnaires;
        this.placements = placements;
        this.demographicMappings = demographicMappings;
    }

    @Transactional(readOnly = true)
    public PortalQuestionnaireContent contentOf(Long questionnaireId) {
        PortalQuestionnaireContent cached = redis.readContent(questionnaireId);
        if (cached != null) {
            return cached;
        }
        Questionnaire questionnaire = questionnaires.findById(questionnaireId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Questionnaire " + questionnaireId + " not found"));
        PortalQuestionnaireContent content = PortalQuestionnaireContent.build(questionnaire,
                placements.findForPortalDelivery(questionnaireId),
                demographicMappings.findForPortalDelivery(questionnaireId));
        redis.writeContent(questionnaireId, content);
        return content;
    }

    /** Direct eviction — the caller knows which questionnaire changed. */
    public void evict(Long questionnaireId) {
        redis.evictContent(questionnaireId);
    }

    /**
     * A bank question changed (stem, options, rows, selection rule): every
     * questionnaire placing it serves different content now. The placement
     * lookup is one indexed id query — cheap enough to run on every question
     * write rather than trying to decide whether the edit "mattered".
     */
    public void evictForQuestion(Long questionId) {
        placements.findQuestionnaireIdsPlacingQuestion(questionId).forEach(this::evict);
    }

    /** A demographic field changed: same reasoning via the form mappings. */
    public void evictForDemographicField(Long demographicFieldId) {
        demographicMappings.findQuestionnaireIdsMappingField(demographicFieldId).forEach(this::evict);
    }
}
