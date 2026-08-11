package com.bodhpsychometric.config;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.auth.UserRepository;

/**
 * Guarantees at startup that every superadmin listed in application.yml exists
 * as a real User row, so those credentials always open the dashboard.
 *
 * Seeding only ever ADDS. An email that already exists is left untouched —
 * including its dob, so a password changed through the dashboard is not
 * reverted on the next restart — and removing an entry from the list does not
 * delete the account. Dropping an admin is a deliberate act against the
 * database, never a side effect of editing config.
 */
@Component
@EnableConfigurationProperties(SuperAdminSeeder.SuperAdminProperties.class)
public class SuperAdminSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SuperAdminSeeder.class);

    private final UserRepository users;
    private final SuperAdminProperties props;

    public SuperAdminSeeder(UserRepository users, SuperAdminProperties props) {
        this.users = users;
        this.props = props;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<Seed> seeds = props.superadmins();
        if (seeds == null || seeds.isEmpty()) {
            log.warn("Superadmin seed skipped: app.superadmins is not configured");
            return;
        }

        // The list is config, so it can contain the same address twice. Track
        // what this pass created rather than trusting the repository lookup to
        // see a row inserted moments ago in the same transaction.
        Set<String> seenEmails = new LinkedHashSet<>();

        for (Seed seed : seeds) {
            String email = seed.email() == null ? "" : seed.email().trim();
            if (email.isBlank() || seed.dob() == null) {
                log.warn("Superadmin entry skipped: email and dob are both required (got email={})", email);
                continue;
            }
            if (!seenEmails.add(email.toLowerCase())) {
                log.warn("Superadmin {} listed more than once; keeping the first entry", email);
                continue;
            }
            if (users.findByEmailIgnoreCase(email).isPresent()) {
                continue;
            }

            User admin = new User();
            admin.setEmail(email);
            admin.setDob(seed.dob());
            admin.setSuperAdmin(true);
            admin.setAccountStatus(true);
            admin = users.save(admin);
            // serialId derives from the generated id, so it is set after insert.
            admin.setSerialId(String.format("USR-%06d", admin.getId()));

            log.info("Seeded superadmin {} as {}", email, admin.getSerialId());
        }
    }

    /**
     * Bound from app.superadmins. A list of objects needs constructor binding
     * — @Value can only read a scalar — hence the record rather than the
     * @Value fields used elsewhere for single settings.
     */
    @ConfigurationProperties(prefix = "app")
    public record SuperAdminProperties(List<Seed> superadmins) {
    }

    /** One configured account. dob is the credential — see User.dob. */
    public record Seed(String email, LocalDate dob) {
    }
}
