package com.bodhpsychometric.bodhassess.v2;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.auth.User;
import com.bodhpsychometric.model.service.UserService;
import com.bodhpsychometric.repository.MeasuredQualityRepository;
import com.bodhpsychometric.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * End-to-end security proof on H2: anonymous → 401; email+dob login → JWT;
 * respondent JWT can reach delivery paths but gets 403 on admin paths;
 * superAdmin passes everywhere; and writes made with a JWT record createdBy.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:bodhauth;MODE=MySQL;DATABASE_TO_LOWER=FALSE;NON_KEYWORDS=USER,VALUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
class AuthFlowTest {

    private static final LocalDate DOB = LocalDate.of(1990, 5, 14);

    @Autowired MockMvc mvc;
    @Autowired UserService userService;
    @Autowired UserRepository userRepository;
    @Autowired MeasuredQualityRepository mqRepository;
    @Autowired ObjectMapper objectMapper;

    @BeforeEach
    void seedUsers() {
        if (!userRepository.existsByEmailIgnoreCase("admin@test.bodh")) {
            User admin = userService.createUser("admin@test.bodh", "Test Admin", DOB,
                    null, null, true, List.of(UserService.ROLE_ADMIN));
            admin.setSuperAdmin(true);
            userRepository.save(admin);
        }
        if (!userRepository.existsByEmailIgnoreCase("taker@test.bodh")) {
            userService.createUser("taker@test.bodh", "Test Respondent", DOB,
                    null, null, true, List.of(UserService.ROLE_RESPONDENT));
        }
    }

    @Test
    void anonymousIsRejectedWith401() throws Exception {
        mvc.perform(get("/api/v2/users")).andExpect(status().isUnauthorized());
    }

    @Test
    void wrongDobIsRejected() throws Exception {
        mvc.perform(post("/api/v2/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"admin@test.bodh\",\"dob\":\"2000-01-01\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminLogsInAndReachesAdminEndpoints() throws Exception {
        String token = login("admin@test.bodh");
        mvc.perform(get("/api/v2/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v2/taxonomy/mqs").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v2/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("admin@test.bodh"));
    }

    @Test
    void respondentIsScopedByRolePaths() throws Exception {
        String token = login("taker@test.bodh");
        // Allowed: delivery paths (404 on the missing id proves it got THROUGH security).
        mvc.perform(get("/api/v2/delivery/sessions/999999").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
        // Denied: admin surface.
        mvc.perform(get("/api/v2/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v2/taxonomy/mqs").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    void writesRecordTheAuthenticatedUserAsCreatedBy() throws Exception {
        String token = login("admin@test.bodh");
        String response = mvc.perform(post("/api/v2/taxonomy/mqs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Audit Probe MQ\",\"description\":null}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long mqId = objectMapper.readTree(response).get("id").asLong();

        Long adminId = userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull("admin@test.bodh")
                .orElseThrow().getId();
        var mq = mqRepository.findById(mqId).orElseThrow();
        assertNotNull(mq.getCreatedBy(), "createdBy should be audited from the JWT principal");
        assertEquals(adminId, mq.getCreatedBy().getId());
    }

    private String login(String email) throws Exception {
        String body = mvc.perform(post("/api/v2/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"" + DOB + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = objectMapper.readTree(body);
        return node.get("token").asText();
    }
}
