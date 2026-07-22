package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.exception.ServiceException;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireCatalogDtos;
import com.bodhpsychometric.bodhassess.payload.ItemDtos;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ItemsService {

    private static final Logger log = LoggerFactory.getLogger(ItemsService.class);

    @PersistenceContext
    private EntityManager em;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional
    public QuestionnaireCatalogDtos.CreateQuestionnaireCatalogResponse createQuestionnaireCatalog(QuestionnaireCatalogDtos.CreateQuestionnaireCatalogRequest req) {
        if (!StringUtils.hasText(req.getName()) || !StringUtils.hasText(req.getVertical())) {
            throw new BadRequestException("name and vertical are required");
        }
        // When the caller supplies an id we upsert on it — that lets the
        // publish flow be idempotent across re-clicks instead of spawning a
        // new instrument row per republish.
        String id = StringUtils.hasText(req.getId()) ? req.getId() : UUID.randomUUID().toString();
        List<String> langs = (req.getLanguages() == null || req.getLanguages().isEmpty())
                ? java.util.Collections.singletonList("en") : req.getLanguages();
        String tier = StringUtils.hasText(req.getTierRequired()) ? req.getTierRequired() : "T1";

        // Pull just the algorithm name out of the inbound scoring_config blob.
        // The rest (mq tree) is redundant with the live measured_qualities
        // tables, so we no longer persist it.
        String scoringModel = null;
        if (req.getScoringConfig() != null && req.getScoringConfig().has("model")
                && !req.getScoringConfig().get("model").isNull()) {
            scoringModel = req.getScoringConfig().get("model").asText();
        }

        // MySQL upsert: INSERT new, UPDATE on conflict. Note: don't touch
        // item_count here — bulkCreateItems recomputes it after items load.
        // Languages live in the instrument_languages join table now — populated
        // below after the parent row is materialised.
        em.createNativeQuery(
            "INSERT INTO instruments (id, tenant_id, name, short_name, vertical, category, description," +
            " duration_minutes, tier_required, is_adaptive, is_fixed_sequence," +
            " item_count, is_published, uses_weighted_scoring, scoring_model)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, TRUE, ?12, ?13)" +
            " ON DUPLICATE KEY UPDATE" +
            "   tenant_id = VALUES(tenant_id), name = VALUES(name), short_name = VALUES(short_name)," +
            "   vertical = VALUES(vertical), category = VALUES(category), description = VALUES(description)," +
            "   duration_minutes = VALUES(duration_minutes)," +
            "   tier_required = VALUES(tier_required), is_adaptive = VALUES(is_adaptive)," +
            "   is_fixed_sequence = VALUES(is_fixed_sequence), is_published = VALUES(is_published)," +
            "   uses_weighted_scoring = VALUES(uses_weighted_scoring), scoring_model = VALUES(scoring_model)")
            .setParameter(1, id)
            .setParameter(2, StringUtils.hasText(req.getTenantId()) ? req.getTenantId() : null)
            .setParameter(3, req.getName())
            .setParameter(4, req.getShortName())
            .setParameter(5, req.getVertical())
            .setParameter(6, req.getCategory())
            .setParameter(7, req.getDescription())
            .setParameter(8, req.getDurationMinutes())
            .setParameter(9, tier)
            .setParameter(10, req.isAdaptive())
            .setParameter(11, req.isFixedSequence())
            .setParameter(12, req.isUsesWeightedScoring())
            .setParameter(13, scoringModel)
            .executeUpdate();

        // Replace the language set in the join table. Upsert semantics mean
        // every republish should reflect exactly the langs the user picked,
        // not accumulate the union of past picks.
        em.createNativeQuery("DELETE FROM instrument_languages WHERE instrument_id = ?1")
            .setParameter(1, id)
            .executeUpdate();
        for (String lang : new java.util.LinkedHashSet<>(langs)) {
            if (lang == null || lang.isEmpty()) continue;
            em.createNativeQuery(
                "INSERT IGNORE INTO instrument_languages (instrument_id, language) VALUES (?1, ?2)")
                .setParameter(1, id)
                .setParameter(2, lang)
                .executeUpdate();
        }

        return new QuestionnaireCatalogDtos.CreateQuestionnaireCatalogResponse(id, req.getName(), req.getVertical(),
                "Questionnaire created. Add questions to build your assessment.");
    }

    @Transactional(readOnly = true)
    public ItemDtos.ItemListResponse listByQuestionnaireCatalog(String instrumentId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT id, sub_domain, item_format, stem, irt_a, irt_b, irt_c," +
            " validation_status, clinical_risk_flag, sequence_order, created_at" +
            " FROM items WHERE instrument_id = ?1 ORDER BY sequence_order, created_at")
            .setParameter(1, instrumentId)
            .getResultList();

        List<ItemDtos.ItemRow> data = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        for (Object[] r : rows) {
            ItemDtos.ItemRow row = new ItemDtos.ItemRow();
            row.setId((String) r[0]);
            row.setSubDomain((String) r[1]);
            row.setFormat((String) r[2]);
            row.setStem((String) r[3]);
            row.setIrtA(r[4] == null ? null : ((Number) r[4]).doubleValue());
            row.setIrtB(r[5] == null ? null : ((Number) r[5]).doubleValue());
            row.setIrtC(r[6] == null ? null : ((Number) r[6]).doubleValue());
            row.setValidationStatus((String) r[7]);
            row.setRiskFlag(asBoolean(r[8]));
            row.setSequence(r[9] == null ? null : ((Number) r[9]).intValue());
            row.setCreatedAt(formatDate(r[10]));
            data.add(row);
            ids.add(row.getId());
        }
        attachItemOptions(data, ids);
        return new ItemDtos.ItemListResponse(data, data.size());
    }

    /**
     * Reassemble each item's `options` array (text + media + nested per-MQT
     * scores) from the normalized child tables. Same shape as the legacy
     * items.options JSON column so the frontend doesn't notice.
     */
    @SuppressWarnings("unchecked")
    private void attachItemOptions(List<ItemDtos.ItemRow> rows, List<String> ids) {
        if (rows.isEmpty() || ids.isEmpty()) return;
        // Pull options for all items in one query.
        List<Object[]> optionRows = em.createNativeQuery(
                "SELECT id, item_id, sort_order, text, media_url, media_type" +
                " FROM item_options WHERE item_id IN (:ids) ORDER BY item_id, sort_order")
                .setParameter("ids", ids)
                .getResultList();
        if (optionRows.isEmpty()) {
            for (ItemDtos.ItemRow row : rows) row.setOptions(new ArrayList<>());
            return;
        }
        java.util.LinkedHashMap<String, List<java.util.Map<String, Object>>> byItem = new java.util.LinkedHashMap<>();
        java.util.LinkedHashMap<Long, java.util.Map<String, Object>> byOptionId = new java.util.LinkedHashMap<>();
        for (Object[] o : optionRows) {
            Long optId = ((Number) o[0]).longValue();
            String itemId = (String) o[1];
            java.util.LinkedHashMap<String, Object> opt = new java.util.LinkedHashMap<>();
            opt.put("text", o[3]);
            opt.put("media_url", o[4]);
            opt.put("media_type", o[5]);
            opt.put("scores", new ArrayList<>());
            byItem.computeIfAbsent(itemId, k -> new ArrayList<>()).add(opt);
            byOptionId.put(optId, opt);
        }
        List<Object[]> scoreRows = em.createNativeQuery(
                "SELECT option_id, mqt_id, score FROM item_option_scores" +
                " WHERE option_id IN (:ids)")
                .setParameter("ids", new ArrayList<>(byOptionId.keySet()))
                .getResultList();
        for (Object[] s : scoreRows) {
            Long optId = ((Number) s[0]).longValue();
            java.util.Map<String, Object> opt = byOptionId.get(optId);
            if (opt == null) continue;
            java.util.LinkedHashMap<String, Object> score = new java.util.LinkedHashMap<>();
            score.put("mqt_id", s[1]);
            score.put("score", ((Number) s[2]).doubleValue());
            @SuppressWarnings("unchecked")
            List<java.util.Map<String, Object>> list = (List<java.util.Map<String, Object>>) opt.get("scores");
            list.add(score);
        }
        for (ItemDtos.ItemRow row : rows) {
            row.setOptions(byItem.getOrDefault(row.getId(), new ArrayList<>()));
        }
    }

    @Transactional
    public ItemDtos.CreateItemResponse createItem(String instrumentId, ItemDtos.CreateItemRequest req) {
        String vertical = lookupVertical(instrumentId);

        if (!StringUtils.hasText(req.getStem())) {
            throw new BadRequestException("stem (question text) is required");
        }
        String format = StringUtils.hasText(req.getFormat()) ? req.getFormat() : "MCQ";
        List<String> languages = (req.getLanguages() == null || req.getLanguages().isEmpty())
                ? java.util.Collections.singletonList("en") : req.getLanguages();

        String id = UUID.randomUUID().toString();
        insertItem(id, instrumentId, vertical, req, format, languages, req.getSequenceOrder());

        em.createNativeQuery(
            "UPDATE instruments SET item_count = (SELECT COUNT(*) FROM items WHERE instrument_id = ?1)," +
            " updated_at = NOW() WHERE id = ?1")
            .setParameter(1, instrumentId)
            .executeUpdate();

        return new ItemDtos.CreateItemResponse(id, instrumentId, req.getStem(), format,
                "Item added to instrument.");
    }

    @Transactional
    public ItemDtos.BulkCreateItemsResponse bulkCreateItems(String instrumentId, ItemDtos.BulkCreateItemsRequest req) {
        String vertical = lookupVertical(instrumentId);
        // Republish should replace, not accumulate. Wipe every child of the
        // instrument's existing items (FK constraints would otherwise block
        // the items DELETE) before inserting the new set.
        deleteItemChildrenForInstrument(instrumentId);
        em.createNativeQuery("DELETE FROM items WHERE instrument_id = ?1")
            .setParameter(1, instrumentId)
            .executeUpdate();
        int created = 0, idx = 0;
        for (ItemDtos.CreateItemRequest item : req.getItems()) {
            idx++;
            if (!StringUtils.hasText(item.getStem())) continue;
            String format = StringUtils.hasText(item.getFormat()) ? item.getFormat() : "MCQ";
            List<String> langs = (item.getLanguages() == null || item.getLanguages().isEmpty())
                    ? java.util.Collections.singletonList("en") : item.getLanguages();
            int seq = item.getSequenceOrder() == null ? idx : item.getSequenceOrder();
            try {
                insertItem(UUID.randomUUID().toString(), instrumentId, vertical, item, format, langs, seq);
                created++;
            } catch (Exception e) {
                log.warn("bulkCreateItems instrument={} row {} failed: {}", instrumentId, idx, e.getMessage());
            }
        }
        em.createNativeQuery(
            "UPDATE instruments SET item_count = (SELECT COUNT(*) FROM items WHERE instrument_id = ?1)," +
            " updated_at = NOW() WHERE id = ?1")
            .setParameter(1, instrumentId)
            .executeUpdate();
        return new ItemDtos.BulkCreateItemsResponse(created, req.getItems().size(), instrumentId, "Items added to instrument.");
    }

    /**
     * Wipe every child row attached to an instrument's items in FK order:
     * option_scores → options → question_scores → languages. Caller is
     * expected to DELETE the items rows themselves immediately after.
     */
    private void deleteItemChildrenForInstrument(String instrumentId) {
        em.createNativeQuery(
            "DELETE ios FROM item_option_scores ios" +
            " JOIN item_options io ON io.id = ios.option_id" +
            " JOIN items i ON i.id = io.item_id" +
            " WHERE i.instrument_id = ?1")
            .setParameter(1, instrumentId).executeUpdate();
        em.createNativeQuery(
            "DELETE io FROM item_options io" +
            " JOIN items i ON i.id = io.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, instrumentId).executeUpdate();
        em.createNativeQuery(
            "DELETE iqs FROM item_question_scores iqs" +
            " JOIN items i ON i.id = iqs.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, instrumentId).executeUpdate();
        em.createNativeQuery(
            "DELETE il FROM item_languages il" +
            " JOIN items i ON i.id = il.item_id WHERE i.instrument_id = ?1")
            .setParameter(1, instrumentId).executeUpdate();
    }

    private String lookupVertical(String instrumentId) {
        @SuppressWarnings("unchecked")
        List<Object> rows = em.createNativeQuery(
            "SELECT vertical FROM instruments WHERE id = ?1")
            .setParameter(1, instrumentId)
            .getResultList();
        if (rows.isEmpty()) throw new ResourceNotFoundException("Questionnaire", "id", instrumentId);
        return (String) rows.get(0);
    }

    private void insertItem(String id, String instrumentId, String vertical, ItemDtos.CreateItemRequest req,
                            String format, List<String> languages, Integer seq) {
        em.createNativeQuery(
            "INSERT INTO items (id, instrument_id, vertical, sub_domain, item_format, stem," +
            " media_url, media_type, irt_a, irt_b, irt_c," +
            " clinical_risk_flag, risk_flag_rule, sequence_order, validation_status)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'DRAFT')")
            .setParameter(1, id)
            .setParameter(2, instrumentId)
            .setParameter(3, vertical)
            .setParameter(4, req.getSubDomain())
            .setParameter(5, format)
            .setParameter(6, req.getStem())
            .setParameter(7, StringUtils.hasText(req.getMediaUrl()) ? req.getMediaUrl() : null)
            .setParameter(8, StringUtils.hasText(req.getMediaType()) ? req.getMediaType() : null)
            .setParameter(9, req.getIrtA())
            .setParameter(10, req.getIrtB())
            // irt_c is NOT NULL on the column; default to 0 when the client
            // doesn't supply it (the questionnaire builder flow doesn't).
            .setParameter(11, req.getIrtC() == null ? 0.0 : req.getIrtC())
            .setParameter(12, req.isRiskFlag())
            .setParameter(13, req.getRiskRule())
            .setParameter(14, seq)
            .executeUpdate();

        // Per-item languages live in the item_languages join table.
        for (String lang : new java.util.LinkedHashSet<>(languages)) {
            if (lang == null || lang.isEmpty()) continue;
            em.createNativeQuery(
                "INSERT IGNORE INTO item_languages (item_id, language) VALUES (?1, ?2)")
                .setParameter(1, id)
                .setParameter(2, lang)
                .executeUpdate();
        }

        // Question-level scores (was the sub_domains JSON array).
        if (req.getSubDomains() != null) {
            for (ItemDtos.SubDomainWeight sd : req.getSubDomains()) {
                if (sd == null || !StringUtils.hasText(sd.getDomain())) continue;
                em.createNativeQuery(
                    "INSERT IGNORE INTO item_question_scores (item_id, mqt_id, score)" +
                    " VALUES (?1, ?2, ?3)")
                    .setParameter(1, id)
                    .setParameter(2, sd.getDomain())
                    .setParameter(3, sd.getWeight())
                    .executeUpdate();
            }
        }

        // MCQ options + their per-option scores (was the nested `options`
        // JSON array). Each option's id auto-increments; LAST_INSERT_ID()
        // gives us the freshly minted row to attach scores to.
        if (req.getOptions() != null) {
            insertItemOptions(id, req.getOptions());
        }
    }

    /**
     * Walk the incoming options payload (Jackson tree or a List<Map>) and
     * persist each as an ItemOption row with nested ItemOptionScore rows.
     */
    @SuppressWarnings("unchecked")
    private void insertItemOptions(String itemId, Object optionsPayload) {
        com.fasterxml.jackson.databind.JsonNode arr;
        try {
            arr = optionsPayload instanceof com.fasterxml.jackson.databind.JsonNode
                    ? (com.fasterxml.jackson.databind.JsonNode) optionsPayload
                    : objectMapper.valueToTree(optionsPayload);
        } catch (Exception e) {
            throw new ServiceException("failed to read options payload", e);
        }
        if (arr == null || !arr.isArray()) return;
        int idx = 0;
        for (com.fasterxml.jackson.databind.JsonNode opt : arr) {
            if (opt == null || !opt.isObject()) { idx++; continue; }
            String text = opt.has("text") && !opt.get("text").isNull() ? opt.get("text").asText() : null;
            String mediaUrl = opt.has("media_url") && !opt.get("media_url").isNull() ? opt.get("media_url").asText() : null;
            String mediaType = opt.has("media_type") && !opt.get("media_type").isNull() ? opt.get("media_type").asText() : null;
            em.createNativeQuery(
                "INSERT INTO item_options (item_id, sort_order, text, media_url, media_type)" +
                " VALUES (?1, ?2, ?3, ?4, ?5)")
                .setParameter(1, itemId)
                .setParameter(2, idx)
                .setParameter(3, text)
                .setParameter(4, mediaUrl)
                .setParameter(5, mediaType)
                .executeUpdate();
            Long optionId = ((Number) em.createNativeQuery("SELECT LAST_INSERT_ID()").getSingleResult()).longValue();

            com.fasterxml.jackson.databind.JsonNode scores = opt.get("scores");
            if (scores != null && scores.isArray()) {
                for (com.fasterxml.jackson.databind.JsonNode s : scores) {
                    if (s == null || !s.isObject()) continue;
                    if (!s.has("mqt_id") || s.get("mqt_id").isNull()) continue;
                    String mqtId = s.get("mqt_id").asText();
                    double score = s.has("score") && s.get("score").isNumber() ? s.get("score").doubleValue() : 0;
                    em.createNativeQuery(
                        "INSERT IGNORE INTO item_option_scores (option_id, mqt_id, score)" +
                        " VALUES (?1, ?2, ?3)")
                        .setParameter(1, optionId)
                        .setParameter(2, mqtId)
                        .setParameter(3, score)
                        .executeUpdate();
                }
            }
            idx++;
        }
    }

    private Object parseJson(Object raw) {
        if (raw == null) return null;
        try {
            return objectMapper.readTree(raw.toString());
        } catch (Exception e) {
            return null;
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
