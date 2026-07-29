package com.bodhpsychometric.bodhassess.config;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.model.Respondent;
import com.bodhpsychometric.bodhassess.model.User;
import com.bodhpsychometric.bodhassess.model.UserMeta;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentRepository;
import com.bodhpsychometric.bodhassess.repository.UserMetaRepository;
import com.bodhpsychometric.bodhassess.repository.UserRepository;

/**
 * One-shot, idempotent identity bootstrap. Runs on every startup:
 *
 *   1. Seeds the env-configured super admin into {@code app_users}
 *      (create-if-absent — never overwrites an existing row).
 *   2. Migrates every legacy {@link Respondent} into {@code app_users} +
 *      {@code user_meta}, preserving the respondent id as the user id so all
 *      existing references (portal_sessions.respondent_id, entity_members)
 *      stay valid. Entity memberships are reconstructed into the new
 *      many-to-many {@code user_entities} from {@code entity_members}.
 *
 * Additive only: the legacy respondents/practitioners tables are left intact
 * for rollback. Runs after {@link JsonToTableMigrationRunner} (@Order 1).
 */
@Component
@Order(2)
public class IdentityBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(IdentityBootstrapRunner.class);

    @Autowired private UserRepository users;
    @Autowired private UserMetaRepository userMeta;
    @Autowired private RespondentRepository respondents;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private AppProperties appProperties;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedSuperAdmin();
        migrateRespondents();
    }

    private void seedSuperAdmin() {
        String email = appProperties.getBootstrap().getSuperAdminEmail();
        String dob = appProperties.getBootstrap().getSuperAdminDob();
        if (!StringUtils.hasText(email)) {
            log.warn("[identity-bootstrap] no super-admin email configured; skipping seed");
            return;
        }
        if (users.findByEmailIgnoreCase(email.trim()).isPresent()) {
            return; // already seeded — create-if-absent
        }
        User su = new User();
        su.setId("U-SUPERADMIN");
        su.setEmail(email.trim());
        su.setDob(dob == null ? null : dob.trim());
        su.setStatus("Active");
        su.setSuperAdmin(true);
        users.save(su);
        log.info("[identity-bootstrap] seeded super admin '{}'", email.trim());
    }

    private void migrateRespondents() {
        // Build respondentId -> set of entityIds once, from entity_members.
        Map<String, java.util.Set<String>> membership = new HashMap<>();
        for (EntityRegistration e : entities.findAll()) {
            if (e.getMemberIds() == null) continue;
            for (String rid : e.getMemberIds()) {
                membership.computeIfAbsent(rid, k -> new java.util.HashSet<>()).add(e.getId());
            }
        }

        int migrated = 0;
        for (Respondent r : respondents.findAll()) {
            if (r.getId() == null) continue;
            // Skip if already migrated (by id) or if the email is taken by a
            // different user row (unique-email guard).
            if (users.existsById(r.getId())) continue;
            if (StringUtils.hasText(r.getEmail())
                    && users.findByEmailIgnoreCase(r.getEmail().trim()).isPresent()) {
                log.warn("[identity-bootstrap] skip respondent {} — email '{}' already a user",
                        r.getId(), r.getEmail());
                continue;
            }

            User u = new User();
            u.setId(r.getId());
            u.setEmail(r.getEmail() == null ? syntheticEmail(r.getId()) : r.getEmail().trim());
            u.setDob(r.getDob());
            u.setStatus("Active");
            u.setSuperAdmin(false);
            java.util.Set<String> ents = membership.get(r.getId());
            if (ents != null) u.setEntityIds(new java.util.HashSet<>(ents));
            users.save(u);

            UserMeta m = new UserMeta();
            m.setUserId(r.getId());
            m.setName(r.getName());
            m.setPhone(r.getPhone());
            m.setConsent(r.getConsent());
            userMeta.save(m);
            migrated++;
        }
        if (migrated > 0) {
            log.info("[identity-bootstrap] migrated {} respondent(s) into app_users/user_meta", migrated);
        }
    }

    // Respondents without an email can't log in by email, but we still want a
    // row so references resolve. A synthetic, unique placeholder keeps the
    // unique constraint happy without inventing a real address.
    private static String syntheticEmail(String id) {
        return "no-email+" + id + "-" + UUID.randomUUID().toString().substring(0, 8) + "@invalid.local";
    }
}
