package com.bodhpsychometric.bodhassess.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import jakarta.persistence.Persistence;

/**
 * Generates the MySQL CREATE script for the complete domain model — offline,
 * no database — via the test-scoped persistence unit (META-INF/persistence.xml).
 * A broken mapping fails schema generation; the generated file
 * (target/generated-schema.sql) doubles as raw material for the Flyway
 * baseline at cutover.
 */
class SchemaGenerationTest {

    // 32 entity tables + 5 value-collection tables:
    // ItemLanguage, RoleUrlPath, OrganizationVertical, OrganizationModule, AssessmentLanguage
    private static final int EXPECTED_TABLES = 37;

    @Test
    void allMappingsBuildAndExportMySqlSchema() throws IOException {
        Path out = Path.of("target", "generated-schema.sql");
        Files.createDirectories(out.getParent());
        Files.deleteIfExists(out);

        Map<String, Object> props = new HashMap<>();
        props.put("hibernate.dialect", "org.hibernate.dialect.MySQLDialect");
        // Offline: never touch JDBC metadata or a live connection.
        props.put("hibernate.temp.use_jdbc_metadata_defaults", "false");
        props.put("jakarta.persistence.schema-generation.database.action", "none");
        props.put("jakarta.persistence.schema-generation.scripts.action", "create");
        props.put("jakarta.persistence.schema-generation.scripts.create-target", out.toString());

        Persistence.generateSchema("bodh-domain", props);   // fails on any broken mapping

        String ddl = Files.readString(out);
        assertEquals(EXPECTED_TABLES, count(ddl, "create table "),
                "unexpected number of tables in generated schema");
        assertTrue(ddl.contains("fkPlacementMq"), "named FK constraints missing from DDL");
        assertTrue(ddl.contains("uqQuestionnaireItem"), "named unique constraints missing from DDL");
        assertTrue(ddl.contains("createdById"), "audited provenance columns missing from DDL");
    }

    private static int count(String haystack, String needle) {
        Matcher m = Pattern.compile(Pattern.quote(needle), Pattern.CASE_INSENSITIVE).matcher(haystack);
        int n = 0;
        while (m.find()) n++;
        return n;
    }
}
