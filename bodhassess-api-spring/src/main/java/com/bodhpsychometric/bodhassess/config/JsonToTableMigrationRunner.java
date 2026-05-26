package com.bodhpsychometric.bodhassess.config;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * One-shot data migration: moves data out of legacy JSON columns into the
 * normalized join/child tables introduced when those entities were converted
 * to @ElementCollection / @OneToMany mappings.
 *
 * Runs on every startup but is idempotent — each row's JSON is only consumed
 * once. A successful migration nulls the legacy column so it isn't re-read.
 *
 * Legacy columns are intentionally left in place (not dropped) so deploys can
 * be rolled back if needed. Drop them in a later cleanup once the new tables
 * are confirmed authoritative.
 */
@Component
@Order(1)
public class JsonToTableMigrationRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(JsonToTableMigrationRunner.class);

    @PersistenceContext
    private EntityManager em;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        // Fast path: once every legacy column has been dropped there's nothing
        // left to do. One COUNT query keeps every subsequent startup quiet
        // instead of firing a dozen INFORMATION_SCHEMA probes.
        Number remaining = (Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
                        + " AND ((TABLE_NAME = 'practitioners'      AND COLUMN_NAME IN ('roles','verticals'))"
                        + "   OR (TABLE_NAME = 'respondent_groups'  AND COLUMN_NAME IN ('member_ids','assigned_instruments'))"
                        + "   OR (TABLE_NAME = 'measured_qualities' AND COLUMN_NAME = 'mqts')"
                        + "   OR (TABLE_NAME = 'portal_sessions'    AND COLUMN_NAME IN ('answers','mqt_scores','demographics'))"
                        + "   OR (TABLE_NAME = 'tenants'            AND COLUMN_NAME = 'branding')"
                        + "   OR (TABLE_NAME = 'users'              AND COLUMN_NAME = 'verticals')"
                        + "   OR (TABLE_NAME = 'instruments'        AND COLUMN_NAME IN ('informant_types','metadata','languages','scoring_config'))"
                        + "   OR (TABLE_NAME = 'roles'              AND COLUMN_NAME = 'url_paths')"
                        + "   OR (TABLE_NAME = 'demographic_fields' AND COLUMN_NAME = 'options')"
                        + "   OR (TABLE_NAME = 'item_display_state' AND COLUMN_NAME = 'override')"
                        + "   OR (TABLE_NAME = 'items'              AND COLUMN_NAME IN ('norm_group','languages','options','sub_domains'))"
                        + "   OR (TABLE_NAME = 'published_questionnaires' AND COLUMN_NAME IN ('languages','demographic_field_keys','mqs','questions')))")
                .getSingleResult();
        boolean sessionsTableExists = tableExists("sessions");
        if (remaining.intValue() == 0 && !sessionsTableExists) return;

        migrateStringListColumn("practitioners", "roles",
                "practitioner_roles", "practitioner_id", "role");
        migrateStringListColumn("practitioners", "verticals",
                "practitioner_verticals", "practitioner_id", "vertical");
        migrateStringListColumn("respondent_groups", "member_ids",
                "respondent_group_members", "group_id", "respondent_id");
        migrateStringListColumn("respondent_groups", "assigned_instruments",
                "respondent_group_instruments", "group_id", "instrument_id");
        migrateMqtTree();
        migratePortalSessionAnswers();
        migratePortalSessionMqtScores();
        migratePortalSessionDemographics();
        migrateItemOptions();
        migrateItemQuestionScores();
        migratePublishedQuestionnaireMqs();
        migratePublishedQuestionnaireQuestions();
        migrateStringListColumn("roles", "url_paths",
                "role_url_paths", "role_id", "url_path");
        migrateStringListColumn("demographic_fields", "options",
                "demographic_field_options", "field_id", "option_value");
        migrateScoringConfigModel();

        // Phase 2: string-list JSON columns on instrument/item/published_questionnaire
        // move into their dedicated join tables.
        migrateStringListColumn("instruments", "languages",
                "instrument_languages", "instrument_id", "language");
        migrateStringListColumn("items", "languages",
                "item_languages", "item_id", "language");
        migrateStringListColumn("published_questionnaires", "languages",
                "published_questionnaire_languages", "questionnaire_id", "language");
        migrateStringListColumn("published_questionnaires", "demographic_field_keys",
                "published_questionnaire_demographic_keys", "questionnaire_id", "field_key");

        // Drop legacy JSON columns now that data has been moved out. Keeping
        // them around would force every INSERT to supply a value for a column
        // the entity no longer maps (the legacy columns are NOT NULL with no
        // default), which would 500 on every create/update.
        dropLegacyColumn("practitioners", "roles");
        dropLegacyColumn("practitioners", "verticals");
        dropLegacyColumn("respondent_groups", "member_ids");
        dropLegacyColumn("respondent_groups", "assigned_instruments");
        dropLegacyColumn("measured_qualities", "mqts");
        dropLegacyColumn("portal_sessions", "answers");
        dropLegacyColumn("portal_sessions", "mqt_scores");
        dropLegacyColumn("portal_sessions", "demographics");

        // Unmapped / unused JSON columns left over from earlier schemas.
        // No data ever populated these, no entity references them — they
        // only cost a column slot and confuse readers of the schema.
        dropLegacyColumn("tenants", "branding");
        dropLegacyColumn("users", "verticals");
        dropLegacyColumn("instruments", "informant_types");
        dropLegacyColumn("instruments", "metadata");
        dropLegacyColumn("instruments", "languages");
        dropLegacyColumn("items", "norm_group");
        dropLegacyColumn("items", "languages");
        dropLegacyColumn("items", "sub_domains");
        dropLegacyColumn("items", "options");
        dropLegacyColumn("published_questionnaires", "languages");
        dropLegacyColumn("published_questionnaires", "demographic_field_keys");
        dropLegacyColumn("published_questionnaires", "mqs");
        dropLegacyColumn("published_questionnaires", "questions");
        dropLegacyColumn("roles", "url_paths");
        dropLegacyColumn("demographic_fields", "options");
        dropLegacyColumn("item_display_state", "override");
        dropLegacyColumn("instruments", "scoring_config");

        // Legacy `sessions` table — superseded by `portal_sessions`. Service
        // and entity were removed earlier; the empty table is the last
        // remnant and is safe to drop.
        if (tableExists("sessions")) {
            em.createNativeQuery("DROP TABLE sessions").executeUpdate();
            log.info("Dropped legacy table sessions");
        }
    }

    /**
     * Drains a JSON string-list column into a join table. Skips rows where
     * the JSON is null/empty — those have already been migrated (or never had
     * data).
     */
    private void migrateStringListColumn(String sourceTable, String sourceColumn,
                                         String targetTable, String fkColumn, String valueColumn) {
        if (!tableExists(sourceTable) || !columnExists(sourceTable, sourceColumn)) {
            return; // brand-new DB — no legacy column to migrate from
        }
        if (!tableExists(targetTable)) {
            log.warn("Skipping migration {}.{} -> {}: target table does not exist yet (Hibernate hasn't created it)",
                    sourceTable, sourceColumn, targetTable);
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, " + sourceColumn + " FROM " + sourceTable
                        + " WHERE " + sourceColumn + " IS NOT NULL AND JSON_LENGTH(" + sourceColumn + ") > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedRows = 0, migratedValues = 0;
        for (Object[] r : rows) {
            String id = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            List<String> values;
            try {
                values = objectMapper.readValue(json, new TypeReference<List<String>>() {});
            } catch (Exception e) {
                log.warn("Could not parse {}.{} for id={}: {}", sourceTable, sourceColumn, id, e.getMessage());
                continue;
            }
            for (String v : values) {
                if (v == null || v.isEmpty()) continue;
                em.createNativeQuery(
                        "INSERT IGNORE INTO " + targetTable + " (" + fkColumn + ", " + valueColumn + ")"
                                + " VALUES (?1, ?2)")
                        .setParameter(1, id)
                        .setParameter(2, v)
                        .executeUpdate();
                migratedValues++;
            }
            // Legacy columns are NOT NULL in older schemas — clear by emptying
            // rather than nulling so we never violate that constraint.
            em.createNativeQuery("UPDATE " + sourceTable + " SET " + sourceColumn + " = '[]' WHERE id = ?1")
                    .setParameter(1, id)
                    .executeUpdate();
            migratedRows++;
        }
        log.info("Migrated {}.{} -> {}: {} rows, {} values", sourceTable, sourceColumn, targetTable,
                migratedRows, migratedValues);
    }

    /**
     * Walks each measured_qualities row's JSON `mqts` tree and inserts flat
     * Mqt rows with mq_id + parent_mqt_id + sort_order. Nulls the JSON column
     * after a successful migration of that MQ.
     */
    private void migrateMqtTree() {
        if (!tableExists("measured_qualities") || !columnExists("measured_qualities", "mqts")) {
            return;
        }
        if (!tableExists("mqts")) {
            log.warn("Skipping MQT migration: 'mqts' table does not exist yet (Hibernate hasn't created it)");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, mqts FROM measured_qualities"
                        + " WHERE mqts IS NOT NULL AND JSON_LENGTH(mqts) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedMqs = 0, migratedMqts = 0;
        for (Object[] r : rows) {
            String mqId = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            JsonNode root;
            try {
                root = objectMapper.readTree(json);
            } catch (Exception e) {
                log.warn("Could not parse measured_qualities.mqts for id={}: {}", mqId, e.getMessage());
                continue;
            }
            if (!root.isArray()) continue;
            List<Object[]> inserts = new ArrayList<>();
            int idx = 0;
            for (JsonNode child : root) {
                flattenMqt(child, mqId, null, idx++, inserts);
            }
            for (Object[] ins : inserts) {
                em.createNativeQuery(
                        "INSERT IGNORE INTO mqts (id, mq_id, parent_mqt_id, name, sort_order)"
                                + " VALUES (?1, ?2, ?3, ?4, ?5)")
                        .setParameter(1, ins[0])
                        .setParameter(2, ins[1])
                        .setParameter(3, ins[2])
                        .setParameter(4, ins[3])
                        .setParameter(5, ins[4])
                        .executeUpdate();
                migratedMqts++;
            }
            // Same NOT NULL guard as the string-list path above.
            em.createNativeQuery("UPDATE measured_qualities SET mqts = '[]' WHERE id = ?1")
                    .setParameter(1, mqId)
                    .executeUpdate();
            migratedMqs++;
        }
        log.info("Migrated MQT trees: {} MQs, {} MQT rows", migratedMqs, migratedMqts);
    }

    private void flattenMqt(JsonNode node, String mqId, String parentMqtId, int sortOrder,
                            List<Object[]> out) {
        if (node == null || !node.isObject()) return;
        String id = node.path("id").asText(null);
        String name = node.path("name").asText(null);
        if (id == null || id.isEmpty()) id = "mqt-" + UUID.randomUUID().toString().substring(0, 8);
        out.add(new Object[]{id, mqId, parentMqtId, name == null ? "" : name, sortOrder});
        JsonNode children = node.get("children");
        if (children != null && children.isArray()) {
            int idx = 0;
            for (JsonNode c : children) {
                flattenMqt(c, mqId, id, idx++, out);
            }
        }
    }

    /**
     * Drains portal_sessions.answers JSON (shape: {questionId: optionIndex |
     * freeText}) into the assessment_answers child table, one row per
     * question. Skips sessions whose JSON is empty/already migrated.
     */
    private void migratePortalSessionAnswers() {
        if (!tableExists("portal_sessions") || !columnExists("portal_sessions", "answers")) {
            return;
        }
        if (!tableExists("assessment_answers")) {
            log.warn("Skipping answers migration: 'assessment_answers' table does not exist yet (Hibernate hasn't created it)");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, answers FROM portal_sessions"
                        + " WHERE answers IS NOT NULL AND JSON_LENGTH(answers) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedSessions = 0, migratedAnswers = 0;
        for (Object[] r : rows) {
            String sessionId = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            JsonNode root;
            try {
                root = objectMapper.readTree(json);
            } catch (Exception e) {
                log.warn("Could not parse portal_sessions.answers for id={}: {}", sessionId, e.getMessage());
                continue;
            }
            if (!root.isObject()) continue;
            java.util.Iterator<String> fields = root.fieldNames();
            while (fields.hasNext()) {
                String qid = fields.next();
                if (qid == null || qid.isEmpty()) continue;
                JsonNode v = root.get(qid);
                Integer optionIndex = null;
                String freeText = null;
                if (v == null || v.isNull()) {
                    continue;
                } else if (v.isNumber()) {
                    optionIndex = v.intValue();
                } else if (v.isTextual()) {
                    String t = v.asText();
                    if (t.isEmpty()) continue;
                    freeText = t;
                } else {
                    freeText = v.toString();
                }
                em.createNativeQuery(
                        "INSERT IGNORE INTO assessment_answers (session_id, question_id, option_index, free_text)"
                                + " VALUES (?1, ?2, ?3, ?4)")
                        .setParameter(1, sessionId)
                        .setParameter(2, qid)
                        .setParameter(3, optionIndex)
                        .setParameter(4, freeText)
                        .executeUpdate();
                migratedAnswers++;
            }
            em.createNativeQuery("UPDATE portal_sessions SET answers = NULL WHERE id = ?1")
                    .setParameter(1, sessionId)
                    .executeUpdate();
            migratedSessions++;
        }
        log.info("Migrated portal_sessions.answers -> assessment_answers: {} sessions, {} answers",
                migratedSessions, migratedAnswers);
    }

    /**
     * Drains portal_sessions.mqt_scores JSON (shape: {mqt_id: {name, score}})
     * into the portal_session_mqt_scores child table. Tolerates legacy shape
     * `{mqt_id_or_name: score}` so older snapshots still migrate.
     */
    private void migratePortalSessionMqtScores() {
        if (!tableExists("portal_sessions") || !columnExists("portal_sessions", "mqt_scores")) {
            return;
        }
        if (!tableExists("portal_session_mqt_scores")) {
            log.warn("Skipping mqt_scores migration: 'portal_session_mqt_scores' table not yet created");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, mqt_scores FROM portal_sessions"
                        + " WHERE mqt_scores IS NOT NULL AND JSON_LENGTH(mqt_scores) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedSessions = 0, migratedScores = 0;
        for (Object[] r : rows) {
            String sessionId = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            JsonNode root;
            try {
                root = objectMapper.readTree(json);
            } catch (Exception e) {
                log.warn("Could not parse portal_sessions.mqt_scores for id={}: {}", sessionId, e.getMessage());
                continue;
            }
            if (!root.isObject()) continue;
            java.util.Iterator<String> fields = root.fieldNames();
            while (fields.hasNext()) {
                String mqtId = fields.next();
                if (mqtId == null || mqtId.isEmpty()) continue;
                JsonNode v = root.get(mqtId);
                Double score = null;
                String name = null;
                if (v == null || v.isNull()) {
                    continue;
                } else if (v.isNumber()) {
                    score = v.doubleValue();
                } else if (v.isObject()) {
                    JsonNode s = v.get("score");
                    if (s != null && s.isNumber()) score = s.doubleValue();
                    JsonNode n = v.get("name");
                    if (n != null && !n.isNull()) name = n.asText();
                }
                if (score == null) continue;
                em.createNativeQuery(
                        "INSERT IGNORE INTO portal_session_mqt_scores (session_id, mqt_id, mqt_name, score)"
                                + " VALUES (?1, ?2, ?3, ?4)")
                        .setParameter(1, sessionId)
                        .setParameter(2, mqtId)
                        .setParameter(3, name)
                        .setParameter(4, score)
                        .executeUpdate();
                migratedScores++;
            }
            em.createNativeQuery("UPDATE portal_sessions SET mqt_scores = NULL WHERE id = ?1")
                    .setParameter(1, sessionId)
                    .executeUpdate();
            migratedSessions++;
        }
        log.info("Migrated portal_sessions.mqt_scores -> portal_session_mqt_scores: {} sessions, {} scores",
                migratedSessions, migratedScores);
    }

    /**
     * Drains portal_sessions.demographics JSON (shape: {field_key: value})
     * into the portal_session_demographics child table.
     */
    private void migratePortalSessionDemographics() {
        if (!tableExists("portal_sessions") || !columnExists("portal_sessions", "demographics")) {
            return;
        }
        if (!tableExists("portal_session_demographics")) {
            log.warn("Skipping demographics migration: 'portal_session_demographics' table not yet created");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, demographics FROM portal_sessions"
                        + " WHERE demographics IS NOT NULL AND JSON_LENGTH(demographics) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedSessions = 0, migratedAnswers = 0;
        for (Object[] r : rows) {
            String sessionId = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            JsonNode root;
            try {
                root = objectMapper.readTree(json);
            } catch (Exception e) {
                log.warn("Could not parse portal_sessions.demographics for id={}: {}", sessionId, e.getMessage());
                continue;
            }
            if (!root.isObject()) continue;
            java.util.Iterator<String> fields = root.fieldNames();
            while (fields.hasNext()) {
                String key = fields.next();
                if (key == null || key.isEmpty()) continue;
                JsonNode v = root.get(key);
                if (v == null || v.isNull()) continue;
                String value = v.isTextual() ? v.asText() : v.toString();
                em.createNativeQuery(
                        "INSERT IGNORE INTO portal_session_demographics (session_id, field_key, value)"
                                + " VALUES (?1, ?2, ?3)")
                        .setParameter(1, sessionId)
                        .setParameter(2, key)
                        .setParameter(3, value)
                        .executeUpdate();
                migratedAnswers++;
            }
            em.createNativeQuery("UPDATE portal_sessions SET demographics = NULL WHERE id = ?1")
                    .setParameter(1, sessionId)
                    .executeUpdate();
            migratedSessions++;
        }
        log.info("Migrated portal_sessions.demographics -> portal_session_demographics: {} sessions, {} answers",
                migratedSessions, migratedAnswers);
    }

    /**
     * Drains items.options JSON (shape: [{text, scores:[{mqt_id,score}],
     * media_url?, media_type?}]) into item_options + item_option_scores.
     */
    private void migrateItemOptions() {
        if (!tableExists("items") || !columnExists("items", "options")) return;
        if (!tableExists("item_options") || !tableExists("item_option_scores")) {
            log.warn("Skipping options migration: child tables not yet created");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, options FROM items WHERE options IS NOT NULL AND JSON_LENGTH(options) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedItems = 0, migratedOptions = 0, migratedScores = 0;
        for (Object[] r : rows) {
            String itemId = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            JsonNode arr;
            try {
                arr = objectMapper.readTree(json);
            } catch (Exception e) {
                log.warn("Could not parse items.options for id={}: {}", itemId, e.getMessage());
                continue;
            }
            if (!arr.isArray()) continue;
            int idx = 0;
            for (JsonNode opt : arr) {
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
                migratedOptions++;

                JsonNode scores = opt.get("scores");
                if (scores != null && scores.isArray()) {
                    for (JsonNode s : scores) {
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
                        migratedScores++;
                    }
                }
                idx++;
            }
            em.createNativeQuery("UPDATE items SET options = NULL WHERE id = ?1")
                    .setParameter(1, itemId).executeUpdate();
            migratedItems++;
        }
        log.info("Migrated items.options -> item_options/item_option_scores: {} items, {} options, {} scores",
                migratedItems, migratedOptions, migratedScores);
    }

    /**
     * Drains items.sub_domains JSON (shape: [{domain, weight}]) into the
     * item_question_scores child table.
     */
    private void migrateItemQuestionScores() {
        if (!tableExists("items") || !columnExists("items", "sub_domains")) return;
        if (!tableExists("item_question_scores")) {
            log.warn("Skipping question_scores migration: child table not yet created");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, sub_domains FROM items" +
                " WHERE sub_domains IS NOT NULL AND JSON_LENGTH(sub_domains) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedItems = 0, migratedScores = 0;
        for (Object[] r : rows) {
            String itemId = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            JsonNode arr;
            try { arr = objectMapper.readTree(json); }
            catch (Exception e) {
                log.warn("Could not parse items.sub_domains for id={}: {}", itemId, e.getMessage());
                continue;
            }
            if (!arr.isArray()) continue;
            for (JsonNode sd : arr) {
                if (sd == null || !sd.isObject()) continue;
                if (!sd.has("domain") || sd.get("domain").isNull()) continue;
                String mqtId = sd.get("domain").asText();
                double score = sd.has("weight") && sd.get("weight").isNumber() ? sd.get("weight").doubleValue() : 0;
                em.createNativeQuery(
                        "INSERT IGNORE INTO item_question_scores (item_id, mqt_id, score)" +
                        " VALUES (?1, ?2, ?3)")
                        .setParameter(1, itemId)
                        .setParameter(2, mqtId)
                        .setParameter(3, score)
                        .executeUpdate();
                migratedScores++;
            }
            em.createNativeQuery("UPDATE items SET sub_domains = '[]' WHERE id = ?1")
                    .setParameter(1, itemId).executeUpdate();
            migratedItems++;
        }
        log.info("Migrated items.sub_domains -> item_question_scores: {} items, {} scores",
                migratedItems, migratedScores);
    }

    /**
     * Drains published_questionnaires.mqs JSON (tree of MQ -> MQTs ->
     * children) into the published_questionnaire_mqs + _mqts tables.
     */
    private void migratePublishedQuestionnaireMqs() {
        if (!tableExists("published_questionnaires") || !columnExists("published_questionnaires", "mqs")) return;
        if (!tableExists("published_questionnaire_mqs") || !tableExists("published_questionnaire_mqts")) {
            log.warn("Skipping published_questionnaires.mqs migration: snapshot tables not yet created");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, mqs FROM published_questionnaires" +
                " WHERE mqs IS NOT NULL AND JSON_LENGTH(mqs) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedPq = 0, migratedMq = 0, migratedMqt = 0;
        for (Object[] r : rows) {
            String pqId = (String) r[0];
            JsonNode arr;
            try { arr = objectMapper.readTree(r[1] == null ? "[]" : r[1].toString()); }
            catch (Exception e) {
                log.warn("Could not parse published_questionnaires.mqs id={}: {}", pqId, e.getMessage());
                continue;
            }
            if (!arr.isArray()) continue;
            int idx = 0;
            for (JsonNode mqNode : arr) {
                if (mqNode == null || !mqNode.isObject()) { idx++; continue; }
                String mqId = mqNode.path("id").asText("");
                String mqName = mqNode.path("name").asText(null);
                em.createNativeQuery(
                        "INSERT INTO published_questionnaire_mqs (questionnaire_id, mq_id, name, sort_order)" +
                        " VALUES (?1, ?2, ?3, ?4)")
                        .setParameter(1, pqId)
                        .setParameter(2, mqId)
                        .setParameter(3, mqName)
                        .setParameter(4, idx)
                        .executeUpdate();
                Long pqMqId = ((Number) em.createNativeQuery("SELECT LAST_INSERT_ID()").getSingleResult()).longValue();
                migratedMq++;

                JsonNode mqts = mqNode.get("mqts");
                if (mqts != null && mqts.isArray()) {
                    int ci = 0;
                    for (JsonNode child : mqts) {
                        migratedMqt += insertSnapshotMqt(pqMqId, null, child, ci++);
                    }
                }
                idx++;
            }
            em.createNativeQuery("UPDATE published_questionnaires SET mqs = NULL WHERE id = ?1")
                    .setParameter(1, pqId).executeUpdate();
            migratedPq++;
        }
        log.info("Migrated published_questionnaires.mqs: {} questionnaires, {} mqs, {} mqts",
                migratedPq, migratedMq, migratedMqt);
    }

    /** Insert one MQT row and recurse into its children. Returns total count. */
    private int insertSnapshotMqt(Long pqMqId, Long parentId, JsonNode node, int sortOrder) {
        if (node == null || !node.isObject()) return 0;
        em.createNativeQuery(
                "INSERT INTO published_questionnaire_mqts (pq_mq_id, parent_id, mqt_id, name, sort_order)" +
                " VALUES (?1, ?2, ?3, ?4, ?5)")
                .setParameter(1, pqMqId)
                .setParameter(2, parentId)
                .setParameter(3, node.path("id").asText(""))
                .setParameter(4, node.path("name").asText(null))
                .setParameter(5, sortOrder)
                .executeUpdate();
        Long thisId = ((Number) em.createNativeQuery("SELECT LAST_INSERT_ID()").getSingleResult()).longValue();
        int count = 1;
        JsonNode kids = node.get("children");
        if (kids != null && kids.isArray()) {
            int ci = 0;
            for (JsonNode c : kids) count += insertSnapshotMqt(pqMqId, thisId, c, ci++);
        }
        return count;
    }

    /**
     * Drains published_questionnaires.questions JSON into the question +
     * option + score snapshot tables.
     */
    private void migratePublishedQuestionnaireQuestions() {
        if (!tableExists("published_questionnaires") || !columnExists("published_questionnaires", "questions")) return;
        if (!tableExists("published_questionnaire_questions")
                || !tableExists("published_questionnaire_question_options")
                || !tableExists("published_questionnaire_question_option_scores")
                || !tableExists("published_questionnaire_question_scores")) {
            log.warn("Skipping published_questionnaires.questions migration: snapshot tables not yet created");
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, questions FROM published_questionnaires" +
                " WHERE questions IS NOT NULL AND JSON_LENGTH(questions) > 0")
                .getResultList();
        if (rows.isEmpty()) return;

        int migratedPq = 0, migratedQ = 0, migratedOpt = 0, migratedScore = 0;
        for (Object[] r : rows) {
            String pqId = (String) r[0];
            JsonNode arr;
            try { arr = objectMapper.readTree(r[1] == null ? "[]" : r[1].toString()); }
            catch (Exception e) {
                log.warn("Could not parse published_questionnaires.questions id={}: {}", pqId, e.getMessage());
                continue;
            }
            if (!arr.isArray()) continue;
            int qi = 0;
            for (JsonNode qNode : arr) {
                if (qNode == null || !qNode.isObject()) { qi++; continue; }
                em.createNativeQuery(
                        "INSERT INTO published_questionnaire_questions" +
                        " (questionnaire_id, snapshot_question_id, stem, format, media_url, media_type," +
                        "  clinical_risk_flag, risk_flag_rule, section_id, section_title, sort_order)" +
                        " VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)")
                        .setParameter(1, pqId)
                        .setParameter(2, qNode.path("id").asText(""))
                        .setParameter(3, qNode.path("stem").asText(null))
                        .setParameter(4, qNode.path("format").asText(null))
                        .setParameter(5, qNode.path("media_url").asText(null))
                        .setParameter(6, qNode.path("media_type").asText(null))
                        .setParameter(7, qNode.path("clinical_risk_flag").asBoolean(false))
                        .setParameter(8, qNode.path("risk_flag_rule").asText(null))
                        .setParameter(9, qNode.hasNonNull("sectionId") ? qNode.get("sectionId").asText() : null)
                        .setParameter(10, qNode.hasNonNull("sectionTitle") ? qNode.get("sectionTitle").asText() : null)
                        .setParameter(11, qi)
                        .executeUpdate();
                Long pqQuestionId = ((Number) em.createNativeQuery("SELECT LAST_INSERT_ID()").getSingleResult()).longValue();
                migratedQ++;

                JsonNode opts = qNode.get("options");
                if (opts != null && opts.isArray()) {
                    int oi = 0;
                    for (JsonNode optNode : opts) {
                        if (optNode == null || !optNode.isObject()) { oi++; continue; }
                        em.createNativeQuery(
                                "INSERT INTO published_questionnaire_question_options" +
                                " (pq_question_id, sort_order, text, media_url, media_type)" +
                                " VALUES (?1, ?2, ?3, ?4, ?5)")
                                .setParameter(1, pqQuestionId)
                                .setParameter(2, oi)
                                .setParameter(3, optNode.path("text").asText(null))
                                .setParameter(4, optNode.path("media_url").asText(null))
                                .setParameter(5, optNode.path("media_type").asText(null))
                                .executeUpdate();
                        Long pqOptionId = ((Number) em.createNativeQuery("SELECT LAST_INSERT_ID()").getSingleResult()).longValue();
                        migratedOpt++;
                        JsonNode scores = optNode.get("scores");
                        if (scores != null && scores.isArray()) {
                            for (JsonNode s : scores) {
                                if (s == null || !s.isObject() || !s.hasNonNull("mqt_id")) continue;
                                em.createNativeQuery(
                                        "INSERT IGNORE INTO published_questionnaire_question_option_scores" +
                                        " (pq_option_id, mqt_id, score) VALUES (?1, ?2, ?3)")
                                        .setParameter(1, pqOptionId)
                                        .setParameter(2, s.get("mqt_id").asText())
                                        .setParameter(3, s.path("score").asDouble(0))
                                        .executeUpdate();
                                migratedScore++;
                            }
                        }
                        oi++;
                    }
                }

                JsonNode qs = qNode.get("question_scores");
                if (qs != null && qs.isArray()) {
                    for (JsonNode s : qs) {
                        if (s == null || !s.isObject() || !s.hasNonNull("mqt_id")) continue;
                        em.createNativeQuery(
                                "INSERT IGNORE INTO published_questionnaire_question_scores" +
                                " (pq_question_id, mqt_id, score) VALUES (?1, ?2, ?3)")
                                .setParameter(1, pqQuestionId)
                                .setParameter(2, s.get("mqt_id").asText())
                                .setParameter(3, s.path("score").asDouble(0))
                                .executeUpdate();
                        migratedScore++;
                    }
                }
                qi++;
            }
            em.createNativeQuery("UPDATE published_questionnaires SET questions = NULL WHERE id = ?1")
                    .setParameter(1, pqId).executeUpdate();
            migratedPq++;
        }
        log.info("Migrated published_questionnaires.questions: {} questionnaires, {} questions, {} options, {} scores",
                migratedPq, migratedQ, migratedOpt, migratedScore);
    }

    /**
     * Extract the algorithm name from each instrument's legacy scoring_config
     * JSON and copy it to the new scoring_model column. The MQ tree inside
     * the JSON is redundant with measured_qualities/mqts and is discarded.
     */
    private void migrateScoringConfigModel() {
        if (!tableExists("instruments")
                || !columnExists("instruments", "scoring_config")
                || !columnExists("instruments", "scoring_model")) {
            return;
        }
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, scoring_config FROM instruments" +
                " WHERE scoring_config IS NOT NULL AND JSON_LENGTH(scoring_config) > 0" +
                " AND (scoring_model IS NULL OR scoring_model = '')")
                .getResultList();
        if (rows.isEmpty()) return;
        int migrated = 0;
        for (Object[] r : rows) {
            String id = (String) r[0];
            String json = r[1] == null ? null : r[1].toString();
            String model = null;
            try {
                JsonNode root = objectMapper.readTree(json);
                if (root.has("model") && !root.get("model").isNull()) {
                    model = root.get("model").asText();
                }
            } catch (Exception e) {
                log.warn("Could not parse instruments.scoring_config for id={}: {}", id, e.getMessage());
                continue;
            }
            if (model == null) continue;
            em.createNativeQuery("UPDATE instruments SET scoring_model = ?1 WHERE id = ?2")
                    .setParameter(1, model)
                    .setParameter(2, id)
                    .executeUpdate();
            migrated++;
        }
        log.info("Migrated instruments.scoring_config -> scoring_model: {} rows", migrated);
    }

    /**
     * Drops a legacy column if it still exists. Logs a single line so each
     * deploy makes it obvious what got cleaned up.
     */
    private void dropLegacyColumn(String table, String column) {
        if (!columnExists(table, column)) return;
        em.createNativeQuery("ALTER TABLE " + table + " DROP COLUMN " + column).executeUpdate();
        log.info("Dropped legacy column {}.{}", table, column);
    }

    private boolean tableExists(String name) {
        Object n = em.createNativeQuery(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES"
                        + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?1")
                .setParameter(1, name)
                .getSingleResult();
        return ((Number) n).intValue() > 0;
    }

    private boolean columnExists(String table, String column) {
        Object n = em.createNativeQuery(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS"
                        + " WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?1 AND COLUMN_NAME = ?2")
                .setParameter(1, table)
                .setParameter(2, column)
                .getSingleResult();
        return ((Number) n).intValue() > 0;
    }
}
