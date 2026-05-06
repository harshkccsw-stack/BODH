package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.payload.InstrumentDtos;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class QuestionnairesCatalogService {

    @PersistenceContext
    private EntityManager em;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public InstrumentDtos.InstrumentListResponse list(String vertical) {
        StringBuilder sql = new StringBuilder(
            "SELECT id, name, short_name, vertical, category, item_count, duration_minutes," +
            " languages, tier_required, is_adaptive, is_fixed_sequence, norm_status, age_range," +
            " is_published, created_at" +
            " FROM instruments WHERE is_published = TRUE"
        );
        javax.persistence.Query q;
        if (StringUtils.hasText(vertical)) {
            sql.append(" AND vertical = ?1 ORDER BY vertical, name");
            q = em.createNativeQuery(sql.toString()).setParameter(1, vertical);
        } else {
            sql.append(" ORDER BY vertical, name");
            q = em.createNativeQuery(sql.toString());
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        List<InstrumentDtos.InstrumentRow> data = new ArrayList<>();
        for (Object[] r : rows) {
            InstrumentDtos.InstrumentRow row = new InstrumentDtos.InstrumentRow();
            row.setId((String) r[0]);
            row.setName((String) r[1]);
            row.setShortName((String) r[2]);
            row.setVertical((String) r[3]);
            row.setCategory((String) r[4]);
            row.setItemCount(r[5] == null ? null : ((Number) r[5]).intValue());
            row.setDurationMinutes(r[6] == null ? null : ((Number) r[6]).intValue());
            row.setLanguages(parseStringList(r[7]));
            row.setTierRequired((String) r[8]);
            row.setAdaptive(asBoolean(r[9]));
            row.setFixedSequence(asBoolean(r[10]));
            row.setNormStatus((String) r[11]);
            row.setAgeRange((String) r[12]);
            row.setPublished(asBoolean(r[13]));
            row.setCreatedAt(formatDate(r[14]));
            data.add(row);
        }
        return new InstrumentDtos.InstrumentListResponse(data, data.size());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(String id) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT name, short_name, vertical, category, item_count, duration_minutes," +
            " languages, tier_required, is_adaptive, is_fixed_sequence, norm_status, age_range, created_at" +
            " FROM instruments WHERE id = ?1")
            .setParameter(1, id)
            .getResultList();
        if (rows.isEmpty()) throw new ResourceNotFoundException("Instrument", "id", id);
        Object[] r = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", r[0]);
        out.put("short_name", r[1]);
        out.put("vertical", r[2]);
        out.put("category", r[3]);
        out.put("item_count", r[4]);
        out.put("duration_minutes", r[5]);
        out.put("languages", parseStringList(r[6]));
        out.put("tier_required", r[7]);
        out.put("is_adaptive", asBoolean(r[8]));
        out.put("is_fixed_sequence", asBoolean(r[9]));
        out.put("norm_status", r[10]);
        out.put("age_range", r[11]);
        out.put("created_at", formatDate(r[12]));
        return out;
    }

    private List<String> parseStringList(Object raw) {
        if (raw == null) return new ArrayList<>();
        try {
            return objectMapper.readValue(raw.toString(), new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private static boolean asBoolean(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() != 0;
        return Boolean.parseBoolean(o.toString());
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
}
