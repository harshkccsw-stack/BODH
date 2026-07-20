package com.bodhpsychometric.config;

import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.auth.UserRepository;

/**
 * Guarantees at startup that the superadmin from application.yml exists as a
 * real User row, so the credentials in config always work. Idempotent: an
 * existing row (matched by email) is left untouched.
 */
@Component
public class SuperAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminSeeder.class);

    private final UserRepository users;
    private final String email;
    private final String dob;

    public SuperAdminSeeder(UserRepository users,
            @Value("${app.superadmin.email:}") String email,
            @Value("${app.superadmin.dob:}") String dob) {
        this.users = users;
        this.email = email;
        this.dob = dob;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (email.isBlank() || dob.isBlank()) {
            log.warn("Superadmin seed skipped: app.superadmin.email/dob not configured");
            return;
        }
        if (users.findByEmailIgnoreCase(email).isPresent()) {
            return;
        }

        User admin = new User();
        admin.setEmail(email);
        admin.setDob(LocalDate.parse(dob));
        admin.setSuperAdmin(true);
        admin.setAccountStatus(true);
        admin = users.save(admin);
        // serialId derives from the generated id, so it is set after insert.
        admin.setSerialId(String.format("USR-%06d", admin.getId()));

        log.info("Seeded superadmin {} as {}", email, admin.getSerialId());
    }
}
