package db.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Legacy data migration: old UUID/varchar world → the rebuilt model.
 * Cross-schema INSERT…SELECT from the ${legacyDb} schema on the same server.
 *
 * Principles: never fail the whole migration on one bad row — record it in
 * MigrationNote and move on; every migrated row leaves a LegacyIdMap entry;
 * old identity silos fold into User deduplicated by email; positional
 * option_index answers resolve against option order at migration time.
 *
 * Skips itself (with a note) when the legacy schema is absent — fresh
 * installs just get the empty new schema.
 */
public class V2__Migrate_legacy_data extends BaseJavaMigration {

    private Connection c;
    private String legacy;
    private final Map<String, Long> idCache = new HashMap<>();
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    @Override
    public void migrate(Context context) throws Exception {
        this.c = context.getConnection();
        this.legacy = context.getConfiguration().getPlaceholders().get("legacyDb");

        if (legacy == null || legacy.isBlank() || !schemaExists(legacy)) {
            note("INFO", null, null, "Legacy schema '" + legacy + "' not found — data migration skipped");
            return;
        }

        migrateTaxonomy();
        migrateRolesAndUsers();
        migrateOrganizations();
        migrateGroups();
        migrateDemographicFields();
        migrateItemBankAndQuestionnaires();
        migrateAssessments();
        migrateSessions();
        note("INFO", null, null, "Legacy data migration finished");
    }

    // ── Taxonomy ─────────────────────────────────────────────────────────

    private void migrateTaxonomy() throws Exception {
        if (!tableExists("measured_qualities")) return;
        for (Map<String, Object> mq : rows("select id, name, description from " + legacy + ".measured_qualities")) {
            long newId = insert("insert into MeasuredQuality (version, createdAt, updatedAt, name, description)"
                            + " values (0, ?, ?, ?, ?)",
                    now(), now(), fallback(str(mq.get("name")), "Unnamed MQ"), str(mq.get("description")));
            map("MQ", str(mq.get("id")), newId);
        }
        if (!tableExists("mqts")) return;
        // Roots first, then children level by level (parent placement must exist).
        List<Map<String, Object>> pending = rows("select id, mq_id, parent_mqt_id, name, sort_order from "
                + legacy + ".mqts");
        Deque<Map<String, Object>> queue = new ArrayDeque<>(pending);
        int stall = 0;
        while (!queue.isEmpty() && stall <= queue.size()) {
            Map<String, Object> mqt = queue.poll();
            String parentLegacy = str(mqt.get("parent_mqt_id"));
            Long parentPlacement = parentLegacy == null ? null : idOf("MQT_PLACEMENT", parentLegacy);
            if (parentLegacy != null && parentPlacement == null) {
                queue.add(mqt);           // parent not migrated yet — retry later
                stall++;
                continue;
            }
            stall = 0;
            Long mqId = idOf("MQ", str(mqt.get("mq_id")));
            if (mqId == null) {
                note("WARN", "MQT", str(mqt.get("id")), "Owning MQ missing — trait skipped");
                continue;
            }
            long traitId = insert("insert into MeasuredQualityTrait (version, createdAt, updatedAt, name)"
                            + " values (0, ?, ?, ?)",
                    now(), now(), fallback(str(mqt.get("name")), "Unnamed trait"));
            map("MQT_TRAIT", str(mqt.get("id")), traitId);
            long placementId = insert("insert into TraitPlacement (version, createdAt, updatedAt,"
                            + " measuredQualityId, traitId, parentPlacementId, sortOrder) values (0, ?, ?, ?, ?, ?, ?)",
                    now(), now(), mqId, traitId, parentPlacement, intOr(mqt.get("sort_order"), 0));
            map("MQT_PLACEMENT", str(mqt.get("id")), placementId);
        }
        for (Map<String, Object> orphan : queue) {
            note("WARN", "MQT", str(orphan.get("id")), "Unresolvable parent chain — trait skipped");
        }
    }

    // ── People ───────────────────────────────────────────────────────────

    private void migrateRolesAndUsers() throws Exception {
        // Seed the three primary roles here so migrated users can reference
        // them (BootstrapDataRunner later finds them and leaves them alone).
        long adminRole = ensureRole("admin", "Full platform administration", "/api/v2/**");
        long practitionerRole = ensureRole("practitioner", "Authoring and assessment administration",
                "/api/v2/auth/**", "/api/v2/taxonomy/**", "/api/v2/items/**", "/api/v2/questionnaires/**",
                "/api/v2/assessments/**", "/api/v2/delivery/**", "/api/v2/demographic-fields/**");
        long respondentRole = ensureRole("respondent", "Taking assessments via the portal",
                "/api/v2/auth/**", "/api/v2/delivery/**");

        if (tableExists("app_users")) {
            boolean hasMeta = tableExists("user_meta");
            for (Map<String, Object> u : rows("select id, email, dob, status, is_super_admin from "
                    + legacy + ".app_users")) {
                Map<String, Object> meta = hasMeta ? row("select name, phone, gender, consent from "
                        + legacy + ".user_meta where user_id = ?", str(u.get("id"))) : null;
                long newId = insertUser(str(u.get("email")), "USER", str(u.get("id")),
                        meta == null ? null : str(meta.get("name")),
                        parseDate(str(u.get("dob")), "USER", str(u.get("id"))),
                        meta == null ? null : str(meta.get("phone")),
                        meta == null ? null : str(meta.get("gender")),
                        meta != null && truthy(str(meta.get("consent"))),
                        truthy(str(u.get("is_super_admin"))) || bool(u.get("is_super_admin")));
                assignRole(newId, adminRole);
            }
        }

        if (tableExists("practitioners")) {
            for (Map<String, Object> p : rows("select id, name, email, phone, dob from "
                    + legacy + ".practitioners")) {
                LocalDate dob = p.get("dob") == null ? null
                        : (p.get("dob") instanceof java.sql.Date d ? d.toLocalDate()
                        : parseDate(str(p.get("dob")), "PRACTITIONER", str(p.get("id"))));
                long newId = insertUser(str(p.get("email")), "PRACTITIONER", str(p.get("id")),
                        str(p.get("name")), dob, str(p.get("phone")), null, false, false);
                assignRole(newId, practitionerRole);
            }
        }

        if (tableExists("respondents")) {
            for (Map<String, Object> r : rows("select id, name, email, phone, dob, consent from "
                    + legacy + ".respondents")) {
                long newId = insertUser(str(r.get("email")), "RESPONDENT", str(r.get("id")),
                        str(r.get("name")), parseDate(str(r.get("dob")), "RESPONDENT", str(r.get("id"))),
                        str(r.get("phone")), null, truthy(str(r.get("consent"))), false);
                assignRole(newId, respondentRole);
            }
        }
    }

    /** Users dedupe by email across all three legacy silos; blanks get placeholders. */
    private long insertUser(String email, String entityType, String legacyId, String name, LocalDate dob,
                            String phone, String gender, boolean consent, boolean superAdmin) throws Exception {
        String effectiveEmail = email == null || email.isBlank()
                ? entityType.toLowerCase(Locale.ROOT) + "-" + legacyId + "@migration.local"
                : email.trim();
        if (email == null || email.isBlank()) {
            note("WARN", entityType, legacyId, "No email — placeholder assigned: " + effectiveEmail);
        }
        Long existing = scalar("select id from User where lower(email) = lower(?)", effectiveEmail);
        long newId;
        if (existing != null) {
            newId = existing;
            note("INFO", entityType, legacyId, "Merged into existing user " + newId + " by email");
        } else {
            newId = insert("insert into User (version, createdAt, updatedAt, email, dob, status,"
                            + " isSuperAdmin, name, phone, gender, consent, consentedAt)"
                            + " values (0, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)",
                    now(), now(), effectiveEmail, dob == null ? null : java.sql.Date.valueOf(dob),
                    superAdmin, name, phone, gender, consent, consent ? now() : null);
        }
        map(entityType, legacyId, newId);
        return newId;
    }

    // ── Organizations & groups ───────────────────────────────────────────

    private void migrateOrganizations() throws Exception {
        if (!tableExists("entity_registrations")) return;
        for (Map<String, Object> e : rows("select id, name, company_name, official_email, phone,"
                + " org_name, org_website, active from " + legacy + ".entity_registrations")) {
            String orgName = fallback(str(e.get("company_name")),
                    fallback(str(e.get("org_name")), fallback(str(e.get("name")), "Unnamed organization")));
            long newId = insert("insert into Organization (version, createdAt, updatedAt, name, website,"
                            + " contactName, contactEmail, contactPhone, status) values (0, ?, ?, ?, ?, ?, ?, ?, ?)",
                    now(), now(), orgName, str(e.get("org_website")), str(e.get("name")),
                    str(e.get("official_email")), str(e.get("phone")),
                    bool(e.get("active")) ? "ACTIVE" : "PENDING");
            map("ENTITY", str(e.get("id")), newId);
        }
        if (tableExists("entity_members")) {
            for (Map<String, Object> m : rows("select entity_id, respondent_id from " + legacy + ".entity_members")) {
                Long orgId = idOf("ENTITY", str(m.get("entity_id")));
                Long userId = idOf("RESPONDENT", str(m.get("respondent_id")));
                if (orgId == null || userId == null) {
                    note("WARN", "ENTITY_MEMBER", str(m.get("respondent_id")), "Unresolved org/user — skipped");
                    continue;
                }
                insert("insert into OrganizationMember (version, createdAt, updatedAt, organizationId, userId)"
                        + " values (0, ?, ?, ?, ?)", now(), now(), orgId, userId);
            }
        }
        copyValueList("entity_verticals", "entity_id", "vertical", "OrganizationVertical", "organizationId", "vertical", "ENTITY");
        copyValueList("entity_platform_modules", "entity_id", "module", "OrganizationModule", "organizationId", "module", "ENTITY");
    }

    private void migrateGroups() throws Exception {
        if (!tableExists("respondent_groups")) return;
        List<Map<String, Object>> groups = rows("select id, name, description, parent_id from "
                + legacy + ".respondent_groups");
        if (groups.isEmpty()) return;
        // Legacy groups had no owning org; the new model requires one.
        long legacyOrg = insert("insert into Organization (version, createdAt, updatedAt, name, status)"
                + " values (0, ?, ?, 'Legacy Unassigned', 'ACTIVE')", now(), now());
        note("WARN", "GROUP", null, "Legacy groups had no organization — all placed under"
                + " 'Legacy Unassigned' (id " + legacyOrg + "); re-home them in the admin UI");

        for (Map<String, Object> g : groups) {   // pass 1: rows
            long newId = insert("insert into RespondentGroup (version, createdAt, updatedAt,"
                            + " organizationId, name, description) values (0, ?, ?, ?, ?, ?)",
                    now(), now(), legacyOrg, fallback(str(g.get("name")), "Unnamed group"),
                    str(g.get("description")));
            map("GROUP", str(g.get("id")), newId);
        }
        for (Map<String, Object> g : groups) {   // pass 2: hierarchy
            String parentLegacy = str(g.get("parent_id"));
            if (parentLegacy == null) continue;
            Long parent = idOf("GROUP", parentLegacy);
            if (parent == null) {
                note("WARN", "GROUP", str(g.get("id")), "Parent group missing — left at top level");
                continue;
            }
            exec("update RespondentGroup set parentGroupId = ? where id = ?",
                    parent, idOf("GROUP", str(g.get("id"))));
        }
        if (tableExists("respondent_group_members")) {
            for (Map<String, Object> m : rows("select group_id, respondent_id from "
                    + legacy + ".respondent_group_members")) {
                Long groupId = idOf("GROUP", str(m.get("group_id")));
                Long userId = idOf("RESPONDENT", str(m.get("respondent_id")));
                if (groupId == null || userId == null) continue;
                insert("insert into RespondentGroupMember (version, createdAt, updatedAt, groupId, userId)"
                        + " values (0, ?, ?, ?, ?)", now(), now(), groupId, userId);
            }
        }
        if (tableExists("respondent_group_instruments")) {
            note("INFO", "GROUP", null,
                    "respondent_group_instruments not migrated — allotments are the only assignment path now");
        }
    }

    // ── Demographic fields ───────────────────────────────────────────────

    private void migrateDemographicFields() throws Exception {
        if (!tableExists("demographic_fields")) return;
        Set<String> knownTypes = Set.of("TEXT", "NUMBER", "DATE", "SELECT", "TEXTAREA");
        for (Map<String, Object> f : rows("select id, field_key, label, type, required, placeholder,"
                + " sort_order, active from " + legacy + ".demographic_fields")) {
            String type = str(f.get("type")) == null ? "TEXT" : str(f.get("type")).toUpperCase(Locale.ROOT);
            if (!knownTypes.contains(type)) {
                note("WARN", "DEMOFIELD", str(f.get("id")), "Unknown type '" + type + "' → TEXT");
                type = "TEXT";
            }
            String key = fallback(str(f.get("field_key")), "field-" + str(f.get("id")));
            long newId = insert("insert into DemographicField (version, createdAt, updatedAt, fieldKey,"
                            + " label, type, required, placeholder, active) values (0, ?, ?, ?, ?, ?, ?, ?, ?)",
                    now(), now(), key, fallback(str(f.get("label")), key), type,
                    bool(f.get("required")), str(f.get("placeholder")), bool(f.get("active")));
            map("DEMOFIELD", str(f.get("id")), newId);
            map("DEMOFIELD_KEY", key, newId);
            if (tableExists("demographic_field_options")) {
                int order = 0;   // legacy stored a Set — order was never real
                for (Map<String, Object> o : rows("select option_value from "
                        + legacy + ".demographic_field_options where field_id = ?", str(f.get("id")))) {
                    insert("insert into DemographicFieldOption (version, createdAt, updatedAt, fieldId,"
                            + " value, sortOrder) values (0, ?, ?, ?, ?, ?)",
                            now(), now(), newId, str(o.get("option_value")), order++);
                }
            }
        }
    }

    // ── Item bank + questionnaires ───────────────────────────────────────

    private void migrateItemBankAndQuestionnaires() throws Exception {
        if (tableExists("instruments")) {
            for (Map<String, Object> i : rows("select id, name, short_name, category, vertical, description,"
                    + " duration_minutes, tier_required, is_adaptive, is_fixed_sequence, norm_status,"
                    + " age_range, uses_weighted_scoring, scoring_model from " + legacy + ".instruments")) {
                long newId = insert("insert into Questionnaire (version, createdAt, updatedAt, name, shortName,"
                                + " category, vertical, description, durationMinutes, tierRequired, isAdaptive,"
                                + " isFixedSequence, normStatus, ageRange, usesWeightedScoring, scoringModel)"
                                + " values (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        now(), now(), fallback(str(i.get("name")), "Unnamed questionnaire"),
                        str(i.get("short_name")), str(i.get("category")), str(i.get("vertical")),
                        str(i.get("description")), i.get("duration_minutes"), str(i.get("tier_required")),
                        bool(i.get("is_adaptive")), bool(i.get("is_fixed_sequence")), str(i.get("norm_status")),
                        str(i.get("age_range")), bool(i.get("uses_weighted_scoring")), str(i.get("scoring_model")));
                map("INSTRUMENT", str(i.get("id")), newId);
            }
        }

        String itemsTable = tableExists("items") ? "items" : (tableExists("item") ? "item" : null);
        if (itemsTable == null) return;
        Set<String> formats = Set.of("MCQ", "RATING_SCALE", "LIKERT", "SJT", "FREE_TEXT",
                "IMAGE_CHOICE", "RANKING", "MATRIX");

        for (Map<String, Object> it : rows("select id, instrument_id, item_format, stem, media_url,"
                + " media_type, irt_a, irt_b, irt_c, validation_status, clinical_risk_flag, risk_flag_rule,"
                + " sub_domain, sequence_order from " + legacy + "." + itemsTable)) {
            String legacyId = str(it.get("id"));
            String format = str(it.get("item_format")) == null ? "MCQ"
                    : str(it.get("item_format")).toUpperCase(Locale.ROOT).replace(' ', '_');
            if (!formats.contains(format)) {
                note("WARN", "ITEM", legacyId, "Unknown format '" + format + "' → MCQ");
                format = "MCQ";
            }
            String vs = str(it.get("validation_status"));
            String validation = vs == null ? "DRAFT"
                    : vs.toUpperCase(Locale.ROOT).contains("VALID") && !vs.toUpperCase(Locale.ROOT).startsWith("NON")
                            ? "VALIDATED" : vs.equalsIgnoreCase("UNDER_REVIEW") ? "UNDER_REVIEW" : "DRAFT";
            long itemId = insert("insert into Item (version, createdAt, updatedAt, format, stem, mediaUrl,"
                            + " mediaType, validationStatus, irtA, irtB, irtC, riskFlag, riskRule, subDomain)"
                            + " values (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    now(), now(), format, str(it.get("stem")), str(it.get("media_url")),
                    str(it.get("media_type")), validation, it.get("irt_a"), it.get("irt_b"), it.get("irt_c"),
                    bool(it.get("clinical_risk_flag")), str(it.get("risk_flag_rule")), str(it.get("sub_domain")));
            map("ITEM", legacyId, itemId);

            if (tableExists("item_languages")) {
                for (Map<String, Object> l : rows("select language from " + legacy
                        + ".item_languages where item_id = ?", legacyId)) {
                    insert("insert into ItemLanguage (itemId, language) values (?, ?)",
                            itemId, str(l.get("language")));
                }
            }

            if (tableExists("item_options")) {
                for (Map<String, Object> o : rows("select id, sort_order, text, media_url, media_type from "
                        + legacy + ".item_options where item_id = ? order by sort_order", legacyId)) {
                    long optionId = insert("insert into AnswerOption (version, createdAt, updatedAt, itemId,"
                                    + " sortOrder, text, mediaUrl, mediaType) values (0, ?, ?, ?, ?, ?, ?, ?)",
                            now(), now(), itemId, intOr(o.get("sort_order"), 0), str(o.get("text")),
                            str(o.get("media_url")), str(o.get("media_type")));
                    map("OPTION", str(o.get("id")), optionId);
                }
            }

            // Membership in the instrument-derived questionnaire, full option coverage included.
            Long questionnaireId = idOf("INSTRUMENT", str(it.get("instrument_id")));
            if (questionnaireId == null) {
                note("WARN", "ITEM", legacyId, "No owning instrument — item kept in bank, no usage created");
                continue;
            }
            long usageId = insert("insert into QuestionnaireItem (version, createdAt, updatedAt,"
                            + " questionnaireId, itemId, sortOrder) values (0, ?, ?, ?, ?, ?)",
                    now(), now(), questionnaireId, itemId, intOr(it.get("sequence_order"), 0));
            map("USAGE", legacyId, usageId);
            exec("insert into QuestionnaireItemOption (version, createdAt, updatedAt, questionnaireItemId,"
                    + " optionId, displayOrder) select 0, ?, ?, ?, id, sortOrder from AnswerOption"
                    + " where itemId = ?", now(), now(), usageId, itemId);
        }

        if (tableExists("item_question_scores")) {
            for (Map<String, Object> s : rows("select item_id, mqt_id, score from "
                    + legacy + ".item_question_scores")) {
                Long usage = idOf("USAGE", str(s.get("item_id")));
                Long placement = idOf("MQT_PLACEMENT", str(s.get("mqt_id")));
                if (usage == null || placement == null) {
                    note("WARN", "ITEM_SCORE", str(s.get("item_id")), "Unresolved usage/placement — skipped");
                    continue;
                }
                insert("insert into ItemUsageTraitScore (version, createdAt, updatedAt, questionnaireItemId,"
                        + " placementId, value) values (0, ?, ?, ?, ?, ?)",
                        now(), now(), usage, placement, dbl(s.get("score")));
            }
        }
        if (tableExists("item_option_scores")) {
            for (Map<String, Object> s : rows("select option_id, mqt_id, score from "
                    + legacy + ".item_option_scores")) {
                Long option = idOf("OPTION", str(s.get("option_id")));
                Long placement = idOf("MQT_PLACEMENT", str(s.get("mqt_id")));
                Long optionUsage = option == null ? null : scalar(
                        "select id from QuestionnaireItemOption where optionId = ?", option);
                if (optionUsage == null || placement == null) {
                    note("WARN", "OPTION_SCORE", str(s.get("option_id")), "Unresolved option/placement — skipped");
                    continue;
                }
                insert("insert into OptionUsageTraitScore (version, createdAt, updatedAt,"
                        + " questionnaireItemOptionId, placementId, value) values (0, ?, ?, ?, ?, ?)",
                        now(), now(), optionUsage, placement, dbl(s.get("score")));
            }
        }

        // Versioned families → instrument questionnaires, matched by name (one-time heuristic).
        if (tableExists("questionnaires")) {
            for (Map<String, Object> f : rows("select id, name from " + legacy + ".questionnaires")) {
                Long match = scalar("select id from Questionnaire where lower(name) = lower(?)",
                        fallback(str(f.get("name")), ""));
                if (match == null) {
                    note("WARN", "FAMILY", str(f.get("id")), "No instrument matches family name '"
                            + str(f.get("name")) + "' — assessments referencing it will be skipped");
                } else {
                    map("FAMILY", str(f.get("id")), match);
                }
            }
        }
    }

    // ── Assessments ──────────────────────────────────────────────────────

    private void migrateAssessments() throws Exception {
        if (!tableExists("assessments")) return;
        Set<String> statuses = Set.of("ACTIVE", "CLOSED", "PAUSED", "TEST");
        for (Map<String, Object> a : rows("select id, name, questionnaire_id, status, auto_next, language"
                + " from " + legacy + ".assessments")) {
            Long questionnaireId = idOf("FAMILY", str(a.get("questionnaire_id")));
            if (questionnaireId == null) {
                questionnaireId = idOf("INSTRUMENT", str(a.get("questionnaire_id")));
            }
            if (questionnaireId == null) {
                note("ERROR", "ASSESSMENT", str(a.get("id")),
                        "Questionnaire unresolvable — assessment skipped (manual fix needed)");
                continue;
            }
            String status = str(a.get("status")) == null ? "ACTIVE"
                    : str(a.get("status")).toUpperCase(Locale.ROOT);
            if (!statuses.contains(status)) status = "ACTIVE";
            long newId = insert("insert into Assessment (version, createdAt, updatedAt, questionnaireId,"
                            + " name, status, autoNext) values (0, ?, ?, ?, ?, ?, ?)",
                    now(), now(), questionnaireId, fallback(str(a.get("name")), "Unnamed assessment"),
                    status, bool(a.get("auto_next")));
            map("ASSESSMENT", str(a.get("id")), newId);
            String language = str(a.get("language"));
            if (language != null && !language.isBlank()) {
                insert("insert into AssessmentLanguage (assessmentId, language) values (?, ?)",
                        newId, language.length() > 8 ? language.substring(0, 8) : language);
            }
        }
        migrateAllotment("assessment_entity_allotments", "entity_id", "ENTITY",
                "AssessmentOrganizationAllotment", "organizationId", true);
        migrateAllotment("assessment_group_allotments", "group_id", "GROUP",
                "AssessmentGroupAllotment", "groupId", false);
        migrateAllotment("assessment_respondent_allotments", "respondent_id", "RESPONDENT",
                "AssessmentRespondentAllotment", "userId", false);
    }

    private void migrateAllotment(String legacyTable, String legacyCol, String mapType,
                                  String newTable, String newCol, boolean hasCap) throws Exception {
        if (!tableExists(legacyTable)) return;
        String capSel = hasCap ? ", cap" : "";
        for (Map<String, Object> r : rows("select assessment_id, " + legacyCol + capSel
                + " from " + legacy + "." + legacyTable)) {
            Long assessment = idOf("ASSESSMENT", str(r.get("assessment_id")));
            Long target = idOf(mapType, str(r.get(legacyCol)));
            if (assessment == null || target == null) {
                note("WARN", "ALLOTMENT", str(r.get(legacyCol)), legacyTable + " row skipped — unresolved refs");
                continue;
            }
            if (hasCap) {
                insert("insert into " + newTable + " (version, createdAt, updatedAt, assessmentId, "
                        + newCol + ", cap) values (0, ?, ?, ?, ?, ?)",
                        now(), now(), assessment, target, r.get("cap"));
            } else {
                insert("insert into " + newTable + " (version, createdAt, updatedAt, assessmentId, "
                        + newCol + ") values (0, ?, ?, ?, ?)", now(), now(), assessment, target);
            }
        }
    }

    // ── Sessions, answers, results ───────────────────────────────────────

    private void migrateSessions() throws Exception {
        if (!tableExists("portal_sessions")) return;
        for (Map<String, Object> s : rows("select id, assessment_id, respondent_id, entity_id, group_id,"
                + " language, name, consent_id, proctoring, invitation_sent, show_question_index, status,"
                + " started_at, completed_at from " + legacy + ".portal_sessions")) {
            String legacyId = str(s.get("id"));
            Long assessment = idOf("ASSESSMENT", str(s.get("assessment_id")));
            Long user = idOf("RESPONDENT", str(s.get("respondent_id")));
            if (assessment == null || user == null) {
                note("WARN", "SESSION", legacyId, "Unresolved assessment/respondent — session skipped");
                continue;
            }
            String language = str(s.get("language"));
            long sessionId = insert("insert into AssessmentSession (version, createdAt, updatedAt,"
                            + " assessmentId, userId, organizationId, groupId, language, name, consentId,"
                            + " proctoring, invitationSent, showQuestionIndex)"
                            + " values (0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    now(), now(), assessment, user,
                    idOf("ENTITY", str(s.get("entity_id"))), idOf("GROUP", str(s.get("group_id"))),
                    language != null && language.length() > 8 ? language.substring(0, 8) : language,
                    str(s.get("name")), str(s.get("consent_id")),
                    bool(s.get("proctoring")), bool(s.get("invitation_sent")), bool(s.get("show_question_index")));
            map("SESSION", legacyId, sessionId);

            boolean completed = "Completed".equalsIgnoreCase(str(s.get("status")));
            Object startedAt = s.get("started_at");
            String status = completed ? "COMPLETED" : startedAt != null ? "IN_PROGRESS" : "NOT_STARTED";
            long attemptId = insert("insert into AssessmentAttempt (version, createdAt, updatedAt,"
                            + " sessionId, attemptNumber, status, startedAt, completedAt)"
                            + " values (0, ?, ?, ?, 1, ?, ?, ?)",
                    now(), now(), sessionId, status, startedAt, s.get("completed_at"));
            map("ATTEMPT", legacyId, attemptId);
        }

        if (tableExists("assessment_answers")) {
            for (Map<String, Object> a : rows("select session_id, question_id, option_index, free_text"
                    + " from " + legacy + ".assessment_answers")) {
                Long attempt = idOf("ATTEMPT", str(a.get("session_id")));
                Long item = idOf("ITEM", str(a.get("question_id")));
                if (attempt == null || item == null) {
                    note("WARN", "ANSWER", str(a.get("question_id")),
                            "Answer skipped — question id does not map to a bank item");
                    continue;
                }
                long answerId = insert("insert into SessionAnswer (version, createdAt, updatedAt,"
                                + " attemptId, itemId, freeText) values (0, ?, ?, ?, ?, ?)",
                        now(), now(), attempt, item, str(a.get("free_text")));
                Object idx = a.get("option_index");
                if (idx != null) {
                    // The legacy positional answer, resolved ONCE, here, forever.
                    Long option = scalar("select id from AnswerOption where itemId = ?"
                            + " order by sortOrder limit 1 offset " + intOr(idx, 0), item);
                    if (option == null) {
                        note("WARN", "ANSWER", str(a.get("question_id")),
                                "option_index " + idx + " out of range — selection dropped");
                    } else {
                        insert("insert into SessionAnswerOption (version, createdAt, updatedAt, answerId,"
                                + " optionId) values (0, ?, ?, ?, ?)", now(), now(), answerId, option);
                    }
                }
            }
        }

        if (tableExists("portal_session_mqt_scores")) {
            for (Map<String, Object> sc : rows("select session_id, mqt_id, score from "
                    + legacy + ".portal_session_mqt_scores")) {
                Long attempt = idOf("ATTEMPT", str(sc.get("session_id")));
                Long placement = idOf("MQT_PLACEMENT", str(sc.get("mqt_id")));
                if (attempt == null || placement == null) {
                    note("WARN", "SESSION_SCORE", str(sc.get("mqt_id")), "Unresolved refs — score skipped");
                    continue;
                }
                insert("insert into SessionTraitScore (version, createdAt, updatedAt, attemptId,"
                        + " placementId, value) values (0, ?, ?, ?, ?, ?)",
                        now(), now(), attempt, placement, dbl(sc.get("score")));
            }
        }

        if (tableExists("portal_session_demographics")) {
            for (Map<String, Object> d : rows("select session_id, field_key, value from "
                    + legacy + ".portal_session_demographics")) {
                Long attempt = idOf("ATTEMPT", str(d.get("session_id")));
                Long field = idOf("DEMOFIELD_KEY", str(d.get("field_key")));
                if (attempt == null || field == null) {
                    note("WARN", "SESSION_DEMOGRAPHIC", str(d.get("field_key")), "Unresolved refs — skipped");
                    continue;
                }
                insert("insert into SessionDemographic (version, createdAt, updatedAt, attemptId, fieldId,"
                        + " value) values (0, ?, ?, ?, ?, ?)",
                        now(), now(), attempt, field, str(d.get("value")));
            }
        }
    }

    // ── plumbing ─────────────────────────────────────────────────────────

    private long ensureRole(String name, String description, String... paths) throws Exception {
        Long existing = scalar("select id from Role where name = ?", name);
        if (existing != null) return existing;
        long id = insert("insert into Role (version, createdAt, updatedAt, name, description)"
                + " values (0, ?, ?, ?, ?)", now(), now(), name, description);
        for (String path : paths) {
            insert("insert into RoleUrlPath (roleId, urlPath) values (?, ?)", id, path);
        }
        return id;
    }

    private void assignRole(long userId, long roleId) throws Exception {
        Long existing = scalar("select id from UserRole where userId = ? and roleId = ?", userId, roleId);
        if (existing == null) {
            insert("insert into UserRole (version, createdAt, updatedAt, userId, roleId)"
                    + " values (0, ?, ?, ?, ?)", now(), now(), userId, roleId);
        }
    }

    private void copyValueList(String legacyTable, String legacyKey, String legacyVal,
                               String newTable, String newKey, String newVal, String mapType) throws Exception {
        if (!tableExists(legacyTable)) return;
        for (Map<String, Object> r : rows("select " + legacyKey + ", " + legacyVal
                + " from " + legacy + "." + legacyTable)) {
            Long owner = idOf(mapType, str(r.get(legacyKey)));
            if (owner == null) continue;
            insert("insert into " + newTable + " (" + newKey + ", " + newVal + ") values (?, ?)",
                    owner, str(r.get(legacyVal)));
        }
    }

    private void map(String type, String legacyId, long newId) throws Exception {
        if (legacyId == null) return;
        idCache.put(type + ":" + legacyId, newId);
        insert("insert into LegacyIdMap (entityType, legacyId, newId) values (?, ?, ?)", type, legacyId, newId);
    }

    private Long idOf(String type, String legacyId) throws Exception {
        if (legacyId == null) return null;
        Long cached = idCache.get(type + ":" + legacyId);
        if (cached != null) return cached;
        Long found = scalar("select newId from LegacyIdMap where entityType = ? and legacyId = ?", type, legacyId);
        if (found != null) idCache.put(type + ":" + legacyId, found);
        return found;
    }

    private void note(String severity, String entityType, String legacyId, String message) throws Exception {
        insert("insert into MigrationNote (severity, entityType, legacyId, note) values (?, ?, ?, ?)",
                severity, entityType, legacyId, message);
    }

    private boolean schemaExists(String schema) throws Exception {
        return scalar("select 1 from information_schema.schemata where lower(schema_name) = lower(?)"
                + " limit 1", schema) != null;
    }

    private boolean tableExists(String table) throws Exception {
        return scalar("select 1 from information_schema.tables where lower(table_schema) = lower(?)"
                + " and lower(table_name) = lower(?) limit 1", legacy, table) != null;
    }

    private List<Map<String, Object>> rows(String sql, Object... params) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                List<Map<String, Object>> result = new ArrayList<>();
                int cols = rs.getMetaData().getColumnCount();
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    for (int i = 1; i <= cols; i++) {
                        row.put(rs.getMetaData().getColumnLabel(i).toLowerCase(Locale.ROOT), rs.getObject(i));
                    }
                    result.add(row);
                }
                return result;
            }
        }
    }

    private Map<String, Object> row(String sql, Object... params) throws Exception {
        List<Map<String, Object>> all = rows(sql, params);
        return all.isEmpty() ? null : all.get(0);
    }

    private Long scalar(String sql, Object... params) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                Object value = rs.getObject(1);
                return value == null ? null : ((Number) value).longValue();
            }
        }
    }

    private long insert(String sql, Object... params) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            bind(ps, params);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                return keys.next() ? keys.getLong(1) : -1;
            }
        }
    }

    private void exec(String sql, Object... params) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            bind(ps, params);
            ps.executeUpdate();
        }
    }

    private static void bind(PreparedStatement ps, Object... params) throws Exception {
        for (int i = 0; i < params.length; i++) {
            ps.setObject(i + 1, params[i]);
        }
    }

    private LocalDate parseDate(String raw, String entityType, String legacyId) throws Exception {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim().substring(0, Math.min(10, raw.trim().length())), ISO);
        } catch (Exception e) {
            note("WARN", entityType, legacyId, "Unparseable dob '" + raw + "' — left null");
            return null;
        }
    }

    private static Timestamp now() {
        return Timestamp.from(Instant.now());
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    private static String fallback(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private static boolean bool(Object o) {
        if (o == null) return false;
        if (o instanceof Boolean b) return b;
        if (o instanceof Number n) return n.intValue() != 0;
        return truthy(String.valueOf(o));
    }

    private static boolean truthy(String s) {
        if (s == null) return false;
        String v = s.trim().toLowerCase(Locale.ROOT);
        return v.equals("true") || v.equals("1") || v.equals("yes") || v.equals("y");
    }

    private static int intOr(Object o, int fallback) {
        return o instanceof Number n ? n.intValue() : fallback;
    }

    private static double dbl(Object o) {
        return o instanceof Number n ? n.doubleValue() : 0.0;
    }
}
