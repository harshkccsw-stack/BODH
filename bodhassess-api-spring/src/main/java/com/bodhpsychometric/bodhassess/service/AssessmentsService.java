package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.payload.AssessmentDto;
import com.bodhpsychometric.bodhassess.payload.HeartbeatRequest;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

import org.springframework.security.access.AccessDeniedException;

@Service
@Transactional
public class AssessmentsService {

    @Autowired
    private PortalSessionRepository repo;

    @Autowired
    private HeartbeatService heartbeats;

    @Transactional(readOnly = true)
    public List<AssessmentDto> list(String respondentId) {
        List<PortalSession> rows = StringUtils.hasText(respondentId)
                ? repo.findByRespondentId(respondentId)
                : repo.findAllOrderByCreated();
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AssessmentDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id)));
    }

    public AssessmentDto create(AssessmentDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getRespondentId())
                || !StringUtils.hasText(dto.getInstrument())) {
            throw new BadRequestException("id, respondentId, instrument required");
        }
        if (repo.existsById(dto.getId())) {
            return toDto(repo.findById(dto.getId()).get());
        }
        PortalSession s = fromDto(dto);
        return toDto(repo.save(s));
    }

    public int bulkCreate(List<AssessmentDto> items) {
        int created = 0;
        for (AssessmentDto dto : items) {
            if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getRespondentId())
                    || !StringUtils.hasText(dto.getInstrument())) continue;
            if (repo.existsById(dto.getId())) continue;
            try {
                repo.save(fromDto(dto));
                created++;
            } catch (Exception ignored) { }
        }
        return created;
    }

    public AssessmentDto update(String id, AssessmentDto dto) {
        PortalSession s = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id));
        if (StringUtils.hasText(dto.getName())) s.setName(dto.getName());
        if (StringUtils.hasText(dto.getLanguage())) s.setLanguage(dto.getLanguage());
        if (StringUtils.hasText(dto.getStatus())) s.setStatus(dto.getStatus());
        s.setScore(dto.getScore());
        if (dto.getAnswers() != null) s.setAnswers(dto.getAnswers());
        if (dto.getMqtScores() != null) s.setMqtScores(dto.getMqtScores());
        if (dto.getDemographics() != null) s.setDemographics(dto.getDemographics());

        if ("Completed".equalsIgnoreCase(dto.getStatus())) {
            OffsetDateTime ts = null;
            if (StringUtils.hasText(dto.getCompletedAt())) {
                try { ts = OffsetDateTime.parse(dto.getCompletedAt()); } catch (Exception ignored) { }
            }
            if (ts == null) ts = OffsetDateTime.now(ZoneOffset.UTC);
            s.setCompletedAt(ts);
            heartbeats.clear(id);
        }
        return toDto(repo.save(s));
    }

    public void recordHeartbeat(String id, HeartbeatRequest body, UserPrincipal principal) {
        PortalSession s = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", id));
        if (principal == null || !s.getRespondentId().equals(principal.getId())) {
            throw new AccessDeniedException("Not the owner of this assessment session");
        }
        if ("Completed".equalsIgnoreCase(s.getStatus())) {
            throw new BadRequestException("Assessment already completed");
        }
        heartbeats.record(id, s.getRespondentId(), s.getInstrument(), s.getGroupId(),
                body.getCurrentIndex(), body.getTotalQuestions());
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private PortalSession fromDto(AssessmentDto dto) {
        PortalSession s = new PortalSession();
        s.setId(dto.getId());
        s.setName(dto.getName());
        s.setRespondentId(dto.getRespondentId());
        s.setRespondentName(dto.getRespondentName());
        s.setRespondentEmail(dto.getRespondentEmail());
        s.setInstrument(dto.getInstrument());
        s.setInstrumentFullName(dto.getInstrumentFullName());
        s.setVertical(dto.getVertical());
        s.setLanguage(StringUtils.hasText(dto.getLanguage()) ? dto.getLanguage() : "English");
        s.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "Active");
        s.setScore(dto.getScore());
        s.setAnswers(dto.getAnswers() == null ? new HashMap<>() : dto.getAnswers());
        Map<String, Object> mqts = dto.getMqtScores() == null ? new HashMap<>() : dto.getMqtScores();
        s.setMqtScores(mqts);
        s.setDemographics(dto.getDemographics() == null ? new HashMap<>() : dto.getDemographics());
        s.setGroupId(dto.getGroupId());
        s.setGroupName(dto.getGroupName());
        s.setConsentId(dto.getConsentId());
        s.setProctoring(dto.isProctoring());
        s.setInvitationSent(dto.isInvitationSent());
        return s;
    }

    private AssessmentDto toDto(PortalSession s) {
        AssessmentDto d = new AssessmentDto();
        d.setId(s.getId());
        d.setName(s.getName());
        d.setRespondentId(s.getRespondentId());
        d.setRespondentName(s.getRespondentName());
        d.setRespondentEmail(s.getRespondentEmail());
        d.setInstrument(s.getInstrument());
        d.setInstrumentFullName(s.getInstrumentFullName());
        d.setVertical(s.getVertical());
        d.setLanguage(s.getLanguage());
        d.setStatus(s.getStatus());
        d.setScore(s.getScore());
        d.setAnswers(s.getAnswers());
        d.setMqtScores(s.getMqtScores());
        d.setDemographics(s.getDemographics());
        d.setGroupId(s.getGroupId());
        d.setGroupName(s.getGroupName());
        d.setConsentId(s.getConsentId());
        d.setProctoring(s.isProctoring());
        d.setInvitationSent(s.isInvitationSent());
        if (s.getCreatedAt() != null) d.setCreatedAt(s.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        if (s.getCompletedAt() != null) d.setCompletedAt(s.getCompletedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }
}
