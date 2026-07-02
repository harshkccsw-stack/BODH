package com.bodhpsychometric.bodhassess.service;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireDto;
import com.bodhpsychometric.bodhassess.repository.PublishedQuestionnaireRepository;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;

@Service
@Transactional
public class QuestionnairesService {

    @Autowired
    private PublishedQuestionnaireRepository repo;

    @Transactional(readOnly = true)
    public List<QuestionnaireDto> list(String vertical) {
        List<PublishedQuestionnaire> rows = StringUtils.hasText(vertical)
                ? repo.findByVertical(vertical)
                : repo.findAllOrderByCreated();
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public QuestionnaireDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", id)));
    }

    @Transactional(readOnly = true)
    public QuestionnaireDto getByName(String name) {
        if (!StringUtils.hasText(name)) throw new BadRequestException("name query param required");
        List<PublishedQuestionnaire> hits = repo.findByName(name);
        if (hits.isEmpty()) throw new ResourceNotFoundException("Questionnaire", "name", name);
        return toDto(hits.get(0));
    }

    /**
     * Idempotent on both id and name so re-publishes overwrite cleanly. We
     * first delete any other row holding this name, then upsert by id.
     */
    public QuestionnaireDto upsert(QuestionnaireDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("id and name are required");
        }
        repo.deleteOthersByName(dto.getName().trim(), dto.getId().trim());

        PublishedQuestionnaire q = repo.findById(dto.getId()).orElseGet(PublishedQuestionnaire::new);
        q.setId(dto.getId());
        q.setName(dto.getName().trim());
        q.setShortName(dto.getShortName());
        q.setVertical(dto.getVertical());
        q.setCategory(dto.getCategory());
        q.setDescription(dto.getDescription());
        q.setDuration(dto.getDuration());
        q.setTier(dto.getTier());
        q.setLanguages(dto.getLanguages() == null ? new ArrayList<>() : new ArrayList<>(dto.getLanguages()));
        q.setMqs(dto.getMqs() == null ? JsonNodeFactory.instance.arrayNode() : dto.getMqs());
        q.setQuestions(dto.getQuestions() == null ? JsonNodeFactory.instance.arrayNode() : dto.getQuestions());
        q.setDemo(dto.isDemo());
        q.setDisclaimer(dto.getDisclaimer());
        q.setDemographicFieldKeys(dto.getDemographicFieldKeys() == null ? new ArrayList<>() : new ArrayList<>(dto.getDemographicFieldKeys()));
        return toDto(repo.save(q));
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private QuestionnaireDto toDto(PublishedQuestionnaire q) {
        QuestionnaireDto d = new QuestionnaireDto();
        d.setId(q.getId());
        d.setName(q.getName());
        d.setShortName(q.getShortName());
        d.setVertical(q.getVertical());
        d.setCategory(q.getCategory());
        d.setDescription(q.getDescription());
        d.setDuration(q.getDuration());
        d.setTier(q.getTier());
        d.setLanguages(q.getLanguages() == null ? new ArrayList<>() : new ArrayList<>(q.getLanguages()));
        d.setMqs(q.getMqs() == null ? JsonNodeFactory.instance.arrayNode() : q.getMqs());
        d.setQuestions(q.getQuestions() == null ? JsonNodeFactory.instance.arrayNode() : q.getQuestions());
        d.setDemo(q.isDemo());
        d.setDisclaimer(q.getDisclaimer());
        d.setDemographicFieldKeys(q.getDemographicFieldKeys() == null ? new ArrayList<>() : new ArrayList<>(q.getDemographicFieldKeys()));
        if (q.getCreatedAt() != null) d.setCreatedAt(q.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }
}
