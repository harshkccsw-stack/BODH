package com.bodhpsychometric.bodhassess.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.payload.LiveAssessmentSummary;
import com.bodhpsychometric.bodhassess.payload.LiveSessionDto;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;

@Service
public class LiveTrackingService {

    @Autowired
    private PortalSessionRepository repo;

    @Autowired
    private HeartbeatService heartbeats;

    public List<LiveAssessmentSummary> listAssessments() {
        List<LiveAssessmentSummary> rows = repo.findAssessmentSummaries();
        for (LiveAssessmentSummary row : rows) {
            List<PortalSession> sessions = repo.findByInstrumentAndGroup(row.getInstrument(), row.getGroupId());
            List<String> activeIds = sessions.stream()
                    .filter(s -> !"Completed".equalsIgnoreCase(s.getStatus()))
                    .map(PortalSession::getId)
                    .collect(Collectors.toList());
            Map<String, HeartbeatService.Record> beats = heartbeats.getMany(activeIds);
            row.setActiveNow(beats.size());
            row.setNotStarted(activeIds.size() - beats.size());
        }
        return rows;
    }

    public List<LiveSessionDto> listSessions(String instrument, String groupId) {
        List<PortalSession> sessions = repo.findByInstrumentAndGroup(instrument, groupId);
        List<String> ids = sessions.stream().map(PortalSession::getId).collect(Collectors.toList());
        Map<String, HeartbeatService.Record> beats = heartbeats.getMany(ids);
        long idleThreshold = heartbeats.getIdleThresholdSeconds();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        List<LiveSessionDto> out = new ArrayList<>(sessions.size());
        for (PortalSession s : sessions) {
            LiveSessionDto d = new LiveSessionDto();
            d.setSessionId(s.getId());
            d.setRespondentId(s.getRespondentId());
            d.setRespondentName(s.getRespondentName());
            d.setRespondentEmail(s.getRespondentEmail());
            d.setSessionStatus(s.getStatus());
            if (s.getCreatedAt() != null) d.setStartedAt(s.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
            if (s.getCompletedAt() != null) d.setCompletedAt(s.getCompletedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));

            HeartbeatService.Record beat = beats.get(s.getId());
            if (beat != null) {
                d.setCurrentIndex(beat.currentIndex);
                d.setTotalQuestions(beat.totalQuestions);
                d.setLastSeen(beat.lastSeen);
                if (beat.totalQuestions != null && beat.totalQuestions > 0 && beat.currentIndex != null) {
                    int pct = (int) Math.floor(100.0 * beat.currentIndex / beat.totalQuestions);
                    d.setPercentComplete(Math.max(0, Math.min(100, pct)));
                }
            }

            d.setLiveStatus(deriveLiveStatus(s, beat, now, idleThreshold));
            out.add(d);
        }
        return out;
    }

    private String deriveLiveStatus(PortalSession s, HeartbeatService.Record beat,
                                    OffsetDateTime now, long idleThresholdSeconds) {
        if ("Completed".equalsIgnoreCase(s.getStatus())) return "completed";
        if (beat == null || beat.lastSeen == null) return "not_started";
        try {
            OffsetDateTime last = OffsetDateTime.parse(beat.lastSeen);
            long elapsed = Duration.between(last, now).getSeconds();
            return elapsed <= idleThresholdSeconds ? "live" : "idle";
        } catch (Exception e) {
            return "not_started";
        }
    }
}
