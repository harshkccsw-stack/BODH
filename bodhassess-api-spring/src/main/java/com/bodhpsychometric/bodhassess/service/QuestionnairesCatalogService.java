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
import com.bodhpsychometric.bodhassess.payload.QuestionnaireCatalogDtos;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class QuestionnairesCatalogService {

    @PersistenceContext
    private EntityManager em;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public QuestionnaireCatalogDtos.QuestionnaireCatalogListResponse list(String vertical) {
        StringBuilder sql = new StringBuilder(
            "SELECT id, name, short_name, vertical, category, item_count, duration_minutes," +
            " tier_required, is_adaptive, is_fixed_sequence, norm_status, age_range," +
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
        List<QuestionnaireCatalogDtos.QuestionnaireCatalogRow> data = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (Object[] r : rows) {
            QuestionnaireCatalogDtos.QuestionnaireCatalogRow row = new QuestionnaireCatalogDtos.QuestionnaireCatalogRow();
            row.setId((String) r[0]);
            row.setName((String) r[1]);
            row.setShortName((String) r[2]);
            row.setVertical((String) r[3]);
            row.setCategory((String) r[4]);
            row.setItemCount(r[5] == null ? null : ((Number) r[5]).intValue());
            row.setDurationMinutes(r[6] == null ? null : ((Number) r[6]).intValue());
            row.setTierRequired((String) r[7]);
            row.setAdaptive(asBoolean(r[8]));
            row.setFixedSequence(asBoolean(r[9]));
            row.setNormStatus((String) r[10]);
            row.setAgeRange((String) r[11]);
            row.setPublished(asBoolean(r[12]));
            row.setCreatedAt(formatDate(r[13]));
            row.setLanguages(new ArrayList<>());
            data.add(row);
            ids.add(row.getId());
        }
        attachLanguages(data, ids);
        return new QuestionnaireCatalogDtos.QuestionnaireCatalogListResponse(data, data.size());
    }

    /** Bulk-load languages from the join table and stamp them onto each row. */
    @SuppressWarnings("unchecked")
    private void attachLanguages(List<QuestionnaireCatalogDtos.QuestionnaireCatalogRow> rows, List<String> ids) {
        if (rows.isEmpty() || ids.isEmpty()) return;
        List<Object[]> langRows = em.createNativeQuery(
                "SELECT instrument_id, language FROM instrument_languages WHERE instrument_id IN (:ids)")
                .setParameter("ids", ids)
                .getResultList();
        Map<String, List<String>> byId = new LinkedHashMap<>();
        for (Object[] lr : langRows) {
            byId.computeIfAbsent((String) lr[0], k -> new ArrayList<>()).add((String) lr[1]);
        }
        for (QuestionnaireCatalogDtos.QuestionnaireCatalogRow row : rows) {
            List<String> langs = byId.get(row.getId());
            if (langs != null) row.setLanguages(langs);
        }
    }

    // Hard delete — removes the instrument row plus its child items and any
    // published_questionnaires row whose name matches. Idempotent: missing
    // ids return silently so callers can re-issue safely.
    @Transactional
    public void delete(String id) {
        if (!StringUtils.hasText(id)) return;
        // Find the row's name first so we can also drop any matching
        // published_questionnaires entry (the dual-write pair from the
        // create-questionnaire flow).
        @SuppressWarnings("unchecked")
        List<Object> names = em.createNativeQuery(
            "SELECT name FROM instruments WHERE id = ?1")
            .setParameter(1, id)
            .getResultList();
        // Items first (FK to instruments), and every child table they own:
        // option_scores -> options, question_scores, languages.
        em.createNativeQuery(
            "DELETE ios FROM item_option_scores ios" +
            " JOIN item_options io ON io.id = ios.option_id" +
            " JOIN items i ON i.id = io.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, id).executeUpdate();
        em.createNativeQuery(
            "DELETE io FROM item_options io" +
            " JOIN items i ON i.id = io.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, id).executeUpdate();
        em.createNativeQuery(
            "DELETE iqs FROM item_question_scores iqs" +
            " JOIN items i ON i.id = iqs.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, id).executeUpdate();
        em.createNativeQuery(
            "DELETE il FROM item_languages il" +
            " JOIN items i ON i.id = il.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, id).executeUpdate();
        em.createNativeQuery("DELETE FROM items WHERE instrument_id = ?1")
            .setParameter(1, id).executeUpdate();
        // Then the instrument's own language rows, then the instrument itself.
        em.createNativeQuery("DELETE FROM instrument_languages WHERE instrument_id = ?1")
            .setParameter(1, id)
            .executeUpdate();
        em.createNativeQuery("DELETE FROM instruments WHERE id = ?1")
            .setParameter(1, id)
            .executeUpdate();
        if (!names.isEmpty() && names.get(0) != null) {
            em.createNativeQuery("DELETE FROM published_questionnaires WHERE LOWER(name) = LOWER(?1)")
                .setParameter(1, names.get(0).toString())
                .executeUpdate();
        }
    }

    @Transactional(readOnly = true)
    public Map<String, Object> get(String id) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT name, short_name, vertical, category, item_count, duration_minutes," +
            " tier_required, is_adaptive, is_fixed_sequence, norm_status, age_range, created_at" +
            " FROM instruments WHERE id = ?1")
            .setParameter(1, id)
            .getResultList();
        if (rows.isEmpty()) throw new ResourceNotFoundException("Questionnaire", "id", id);
        Object[] r = rows.get(0);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("name", r[0]);
        out.put("short_name", r[1]);
        out.put("vertical", r[2]);
        out.put("category", r[3]);
        out.put("item_count", r[4]);
        out.put("duration_minutes", r[5]);
        out.put("tier_required", r[6]);
        out.put("is_adaptive", asBoolean(r[7]));
        out.put("is_fixed_sequence", asBoolean(r[8]));
        out.put("norm_status", r[9]);
        out.put("age_range", r[10]);
        out.put("created_at", formatDate(r[11]));
        // Per-instrument languages now live in their own table.
        @SuppressWarnings("unchecked")
        List<String> langs = em.createNativeQuery(
                "SELECT language FROM instrument_languages WHERE instrument_id = ?1 ORDER BY language")
                .setParameter(1, id)
                .getResultList();
        out.put("languages", langs);
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
