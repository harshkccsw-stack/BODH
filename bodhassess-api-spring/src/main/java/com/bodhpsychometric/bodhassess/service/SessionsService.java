package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.payload.SessionDtos;

@Service
public class SessionsService {

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public SessionDtos.SessionListResponse list(String vertical, String status) {
        StringBuilder sql = new StringBuilder(
            "SELECT s.id, s.vertical, s.language, s.status, s.is_proctored, s.trust_score, s.theta_estimate," +
            " s.started_at, s.completed_at, s.created_at, u.name AS respondent_name, i.short_name AS instrument_name" +
            " FROM sessions s" +
            " JOIN users u ON s.respondent_id = u.id" +
            " JOIN instruments i ON s.instrument_id = i.id" +
            " WHERE 1=1"
        );
        List<Object> args = new ArrayList<>();
        int idx = 1;
        if (StringUtils.hasText(vertical)) {
            sql.append(" AND s.vertical = ?").append(idx++);
            args.add(vertical);
        }
        if (StringUtils.hasText(status)) {
            sql.append(" AND s.status = ?").append(idx++);
            args.add(status);
        }
        sql.append(" ORDER BY s.created_at DESC LIMIT 50");

        @SuppressWarnings("unchecked")
        List<Object[]> rows = (List<Object[]>) buildQuery(sql.toString(), args).getResultList();

        List<SessionDtos.SessionRow> out = new ArrayList<>();
        for (Object[] r : rows) {
            SessionDtos.SessionRow row = new SessionDtos.SessionRow();
            row.setId((String) r[0]);
            row.setVertical((String) r[1]);
            row.setLanguage((String) r[2]);
            row.setStatus((String) r[3]);
            row.setProctored(asBoolean(r[4]));
            row.setTrustScore(r[5] == null ? null : ((Number) r[5]).doubleValue());
            row.setThetaEstimate(((Number) r[6]).doubleValue());
            row.setStartedAt(formatDate(r[7]));
            row.setCompletedAt(formatDate(r[8]));
            row.setCreatedAt(formatDate(r[9]));
            row.setRespondentName((String) r[10]);
            row.setInstrumentName((String) r[11]);
            out.add(row);
        }
        return new SessionDtos.SessionListResponse(out, out.size());
    }

    @Transactional
    public SessionDtos.CreateSessionResponse create(SessionDtos.CreateSessionRequest req) {
        if (!StringUtils.hasText(req.getConsentId())) {
            throw new BadRequestException("consent_id is required — DPDP compliance");
        }
        String id = UUID.randomUUID().toString();
        em.createNativeQuery(
            "INSERT INTO sessions (id, tenant_id, practitioner_id, respondent_id, instrument_id, consent_id," +
            " vertical, language, is_proctored, status)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'CREATED')")
            .setParameter(1, id)
            .setParameter(2, req.getTenantId())
            .setParameter(3, req.getPractitionerId())
            .setParameter(4, req.getRespondentId())
            .setParameter(5, req.getInstrumentId())
            .setParameter(6, req.getConsentId())
            .setParameter(7, req.getVertical())
            .setParameter(8, req.getLanguage())
            .setParameter(9, req.isProctored())
            .executeUpdate();
        return new SessionDtos.CreateSessionResponse(id, "CREATED",
                "Session created. Send invitation to respondent.");
    }

    @Transactional(readOnly = true)
    public java.util.Map<String, Object> get(String id) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT vertical, language, status, is_proctored, theta_estimate, created_at" +
            " FROM sessions WHERE id = ?1")
            .setParameter(1, id)
            .getResultList();
        if (rows.isEmpty()) throw new ResourceNotFoundException("Session", "id", id);
        Object[] r = rows.get(0);
        java.util.LinkedHashMap<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("id", id);
        out.put("vertical", r[0]);
        out.put("language", r[1]);
        out.put("status", r[2]);
        out.put("is_proctored", asBoolean(r[3]));
        out.put("theta_estimate", r[4]);
        out.put("created_at", formatDate(r[5]));
        return out;
    }

    private String formatDate(Object o) {
        if (o == null) return null;
        if (o instanceof OffsetDateTime) return ((OffsetDateTime) o).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        if (o instanceof java.sql.Timestamp) {
            return ((java.sql.Timestamp) o).toInstant().atOffset(java.time.ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        }
        return o.toString();
    }

    private static boolean asBoolean(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() != 0;
        return Boolean.parseBoolean(o.toString());
    }

    private javax.persistence.Query buildQuery(String sql, List<Object> args) {
        javax.persistence.Query q = em.createNativeQuery(sql);
        for (int i = 0; i < args.size(); i++) {
            q.setParameter(i + 1, args.get(i));
        }
        return q;
    }
}
