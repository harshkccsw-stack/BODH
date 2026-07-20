package com.bodhpsychometric.bodhassess.v2;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Boots the FULL application context on in-memory H2 (MySQL compatibility
 * mode): every entity mapping is DDL'd, every repository query method is
 * parsed and validated, every service and controller is wired. This is the
 * phase-3 smoke test — it fails on any broken query derivation or bean.
 */
@SpringBootTest
@TestPropertySource(properties = {
        // NON_KEYWORDS: User/value are valid identifiers in MySQL but reserved in H2.
        "spring.datasource.url=jdbc:h2:mem:bodh;MODE=MySQL;DATABASE_TO_LOWER=FALSE;NON_KEYWORDS=USER,VALUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
class ApiV2ApplicationTests {

    @Test
    void contextLoads() {
        // Wiring + mapping + query validation happen during startup.
    }
}
