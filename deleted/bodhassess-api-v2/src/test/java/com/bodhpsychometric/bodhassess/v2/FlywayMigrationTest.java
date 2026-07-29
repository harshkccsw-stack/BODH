package com.bodhpsychometric.bodhassess.v2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;

/**
 * End-to-end migration proof: a synthetic legacy schema (old snake_case
 * world) is loaded BEFORE the context starts; Flyway then runs V1 (new
 * schema + hardening) and V2 (Java data migration); assertions verify every
 * transform — silo folding with email dedupe, taxonomy → placements,
 * items/scores → usage edges, family-by-name matching, positional
 * option_index resolution, and the bookkeeping tables.
 */
@SpringBootTest
@ContextConfiguration(initializers = FlywayMigrationTest.LegacyFixture.class)
@TestPropertySource(properties = {
        "spring.datasource.url=" + FlywayMigrationTest.URL,
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "spring.flyway.placeholders.legacyDb=legacy"
})
class FlywayMigrationTest {

    static final String URL =
            "jdbc:h2:mem:bodhmig;MODE=MySQL;DATABASE_TO_LOWER=FALSE;NON_KEYWORDS=USER,VALUE;DB_CLOSE_DELAY=-1";

    /** Loads the legacy fixture before Spring (and therefore Flyway) starts. */
    static class LegacyFixture implements ApplicationContextInitializer<ConfigurableApplicationContext> {
        @Override
        public void initialize(ConfigurableApplicationContext ctx) {
            try (Connection connection = DriverManager.getConnection(URL, "sa", "")) {
                org.h2.tools.RunScript.execute(connection, new InputStreamReader(
                        getClass().getResourceAsStream("/legacy-fixture.sql"), StandardCharsets.UTF_8));
            } catch (Exception e) {
                throw new IllegalStateException("legacy fixture failed", e);
            }
        }
    }

    @Autowired JdbcTemplate jdbc;

    @Test
    void identitySilosFoldIntoUsersWithEmailDedupe() {
        // au-1, p-1, r-1, r-2 → 4 users; r-3 merges into au-1 by email.
        assertEquals(4, count("select count(*) from User"));
        Long adminId = jdbc.queryForObject(
                "select id from User where email = 'admin@legacy.test'", Long.class);
        Long r3Mapped = jdbc.queryForObject(
                "select newId from LegacyIdMap where entityType = 'RESPONDENT' and legacyId = 'r-3'", Long.class);
        assertEquals(adminId, r3Mapped, "duplicate-email respondent should merge into the admin user");
        // Placeholder email for the blank one, with a warning note.
        assertEquals(1, count("select count(*) from User where email like 'respondent-r-2@%'"));
        assertTrue(count("select count(*) from MigrationNote where severity = 'WARN'"
                + " and legacyId = 'r-2'") >= 1);
        // Role assignments: admin role from app_users, respondent role from silo.
        assertEquals(1, count("select count(*) from UserRole ur join Role r on r.id = ur.roleId"
                + " where r.name = 'admin'"));
        assertEquals(3, count("select count(*) from UserRole ur join Role r on r.id = ur.roleId"
                + " where r.name = 'respondent'"));
    }

    @Test
    void taxonomyBecomesLibraryPlusPlacements() {
        assertEquals(1, count("select count(*) from MeasuredQuality"));
        assertEquals(2, count("select count(*) from MeasuredQualityTrait"));
        assertEquals(2, count("select count(*) from TraitPlacement"));
        // 'Working Memory' sits under 'Memory' in the same MQ.
        assertEquals(1, count("select count(*) from TraitPlacement child"
                + " join TraitPlacement parent on parent.id = child.parentPlacementId"
                + " join MeasuredQualityTrait t on t.id = child.traitId"
                + " where t.name = 'Working Memory'"));
    }

    @Test
    void itemBankAndUsagesMigrateWithScores() {
        assertEquals(1, count("select count(*) from Questionnaire"));
        assertEquals(2, count("select count(*) from Item"));
        assertEquals(2, count("select count(*) from AnswerOption"));
        assertEquals(2, count("select count(*) from QuestionnaireItem"));
        assertEquals(2, count("select count(*) from QuestionnaireItemOption"));   // full coverage, MCQ only
        assertEquals(1, count("select count(*) from ItemUsageTraitScore"));
        assertEquals(1, count("select count(*) from OptionUsageTraitScore"));
        assertEquals(1, count("select count(*) from Item where validationStatus = 'VALIDATED'"));
        assertEquals(1, count("select count(*) from ItemLanguage"));
    }

    @Test
    void assessmentResolvesFamilyByNameAndCarriesAllotments() {
        assertEquals(1, count("select count(*) from Assessment"));
        assertNotNull(jdbc.queryForObject("select newId from LegacyIdMap"
                + " where entityType = 'FAMILY' and legacyId = 'f-1'", Long.class));
        assertEquals(1, count("select count(*) from AssessmentLanguage"));
        assertEquals(10, count("select cap from AssessmentOrganizationAllotment"));
        assertEquals(1, count("select count(*) from AssessmentRespondentAllotment"));
    }

    @Test
    void sessionsAnswersAndResultsSurvive() {
        assertEquals(1, count("select count(*) from AssessmentSession"));
        assertEquals(1, count("select count(*) from AssessmentAttempt where status = 'COMPLETED'"));
        assertEquals(2, count("select count(*) from SessionAnswer"));
        // option_index 1 resolved to the option with sortOrder 1 ('Often').
        assertEquals(1, count("select count(*) from SessionAnswerOption sao"
                + " join AnswerOption o on o.id = sao.optionId where o.text = 'Often'"));
        assertEquals(1, count("select count(*) from SessionAnswer where freeText = 'It was rough but fine'"));
        assertEquals(1, count("select count(*) from SessionTraitScore where value = 12.5"));
        assertEquals(1, count("select count(*) from SessionDemographic"));
    }

    @Test
    void organizationsAndGroupsMigrate() {
        // Acme (from entity_registrations) + 'Legacy Unassigned' (owner of orphan groups).
        assertEquals(2, count("select count(*) from Organization"));
        assertEquals(1, count("select count(*) from Organization where name = 'Acme Corp'"
                + " and status = 'ACTIVE'"));
        assertEquals(1, count("select count(*) from OrganizationMember"));
        assertEquals(1, count("select count(*) from RespondentGroup rg"
                + " join Organization o on o.id = rg.organizationId where o.name = 'Legacy Unassigned'"));
        assertEquals(1, count("select count(*) from RespondentGroupMember"));
    }

    @Test
    void demographicRegistryMigrates() {
        assertEquals(1, count("select count(*) from DemographicField where fieldKey = 'age_group'"
                + " and type = 'SELECT'"));
        assertEquals(2, count("select count(*) from DemographicFieldOption"));
    }

    private int count(String sql) {
        Integer result = jdbc.queryForObject(sql, Integer.class);
        return result == null ? 0 : result;
    }
}
