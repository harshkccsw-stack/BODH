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
        String id = UUID.randomUUID().toString();
        List<String> langs = (req.getLanguages() == null || req.getLanguages().isEmpty())
                ? java.util.Collections.singletonList("en") : req.getLanguages();
        String tier = StringUtils.hasText(req.getTierRequired()) ? req.getTierRequired() : "T1";

        String scoringJson;
        String langsJson;
        try {
            scoringJson = req.getScoringConfig() == null ? "{}" : objectMapper.writeValueAsString(req.getScoringConfig());
            langsJson = objectMapper.writeValueAsString(langs);
        } catch (Exception e) {
            throw new ServiceException("invalid scoring_config", e);
        }

        em.createNativeQuery(
            "INSERT INTO instruments (id, tenant_id, name, short_name, vertical, category, description," +
            " duration_minutes, languages, tier_required, is_adaptive, is_fixed_sequence," +
            " item_count, is_published, uses_weighted_scoring, scoring_config)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, TRUE, ?13, ?14)")
            .setParameter(1, id)
            .setParameter(2, StringUtils.hasText(req.getTenantId()) ? req.getTenantId() : null)
            .setParameter(3, req.getName())
            .setParameter(4, req.getShortName())
            .setParameter(5, req.getVertical())
            .setParameter(6, req.getCategory())
            .setParameter(7, req.getDescription())
            .setParameter(8, req.getDurationMinutes())
            .setParameter(9, langsJson)
            .setParameter(10, tier)
            .setParameter(11, req.isAdaptive())
            .setParameter(12, req.isFixedSequence())
            .setParameter(13, req.isUsesWeightedScoring())
            .setParameter(14, scoringJson)
            .executeUpdate();

        return new QuestionnaireCatalogDtos.CreateQuestionnaireCatalogResponse(id, req.getName(), req.getVertical(),
                "Questionnaire created. Add questions to build your assessment.");
    }

    @Transactional(readOnly = true)
    public ItemDtos.ItemListResponse listByQuestionnaireCatalog(String instrumentId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
            "SELECT id, sub_domain, item_format, stem, options, irt_a, irt_b, irt_c," +
            " validation_status, clinical_risk_flag, sequence_order, created_at" +
            " FROM items WHERE instrument_id = ?1 ORDER BY sequence_order, created_at")
            .setParameter(1, instrumentId)
            .getResultList();

        List<ItemDtos.ItemRow> data = new ArrayList<>();
        for (Object[] r : rows) {
            ItemDtos.ItemRow row = new ItemDtos.ItemRow();
            row.setId((String) r[0]);
            row.setSubDomain((String) r[1]);
            row.setFormat((String) r[2]);
            row.setStem((String) r[3]);
            row.setOptions(parseJson(r[4]));
            row.setIrtA(r[5] == null ? null : ((Number) r[5]).doubleValue());
            row.setIrtB(r[6] == null ? null : ((Number) r[6]).doubleValue());
            row.setIrtC(r[7] == null ? null : ((Number) r[7]).doubleValue());
            row.setValidationStatus((String) r[8]);
            row.setRiskFlag(asBoolean(r[9]));
            row.setSequence(r[10] == null ? null : ((Number) r[10]).intValue());
            row.setCreatedAt(formatDate(r[11]));
            data.add(row);
        }
        return new ItemDtos.ItemListResponse(data, data.size());
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
        String optionsJson;
        String subDomainsJson;
        String langsJson;
        try {
            optionsJson = req.getOptions() == null ? null : objectMapper.writeValueAsString(req.getOptions());
            subDomainsJson = (req.getSubDomains() == null || req.getSubDomains().isEmpty())
                    ? "[]" : objectMapper.writeValueAsString(req.getSubDomains());
            langsJson = objectMapper.writeValueAsString(languages);
        } catch (Exception e) {
            throw new ServiceException("failed to serialize item payload", e);
        }
        em.createNativeQuery(
            "INSERT INTO items (id, instrument_id, vertical, sub_domain, sub_domains, item_format, stem," +
            " media_url, media_type, options, irt_a, irt_b, irt_c," +
            " clinical_risk_flag, risk_flag_rule, sequence_order, languages, validation_status)" +
            " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'DRAFT')")
            .setParameter(1, id)
            .setParameter(2, instrumentId)
            .setParameter(3, vertical)
            .setParameter(4, req.getSubDomain())
            .setParameter(5, subDomainsJson)
            .setParameter(6, format)
            .setParameter(7, req.getStem())
            .setParameter(8, StringUtils.hasText(req.getMediaUrl()) ? req.getMediaUrl() : null)
            .setParameter(9, StringUtils.hasText(req.getMediaType()) ? req.getMediaType() : null)
            .setParameter(10, optionsJson)
            .setParameter(11, req.getIrtA())
            .setParameter(12, req.getIrtB())
            .setParameter(13, req.getIrtC())
            .setParameter(14, req.isRiskFlag())
            .setParameter(15, req.getRiskRule())
            .setParameter(16, seq)
            .setParameter(17, langsJson)
            .executeUpdate();
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
