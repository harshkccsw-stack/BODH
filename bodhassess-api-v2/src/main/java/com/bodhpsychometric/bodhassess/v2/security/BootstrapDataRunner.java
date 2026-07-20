package com.bodhpsychometric.bodhassess.v2.security;

import java.time.LocalDate;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.auth.Role;
import com.bodhpsychometric.auth.User;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.UserRole;
import com.bodhpsychometric.bodhassess.domain.service.UserService;
import com.bodhpsychometric.repository.RoleRepository;
import com.bodhpsychometric.repository.UserRepository;
import com.bodhpsychometric.repository.UserRoleRepository;

/**
 * Idempotent first-run seeding: the three primary roles (created with
 * default url-path allow-lists ONLY when missing — admin edits are never
 * overwritten) and, when the bootstrap env vars are set, an initial
 * superAdmin account.
 */
@Component
public class BootstrapDataRunner implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;
    private final String adminEmail;
    private final String adminDob;
    private final String adminName;

    public BootstrapDataRunner(RoleRepository roleRepository,
                               UserRepository userRepository,
                               UserRoleRepository userRoleRepository,
                               @Value("${bodh.security.bootstrap-admin-email}") String adminEmail,
                               @Value("${bodh.security.bootstrap-admin-dob}") String adminDob,
                               @Value("${bodh.security.bootstrap-admin-name}") String adminName) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.adminEmail = adminEmail;
        this.adminDob = adminDob;
        this.adminName = adminName;
    }

    @Override
    @Transactional
    public void run(String... args) {
        Role admin = ensureRole(UserService.ROLE_ADMIN, "Full platform administration",
                Set.of("/api/v2/**"));
        ensureRole(UserService.ROLE_PRACTITIONER, "Authoring and assessment administration",
                Set.of("/api/v2/auth/**", "/api/v2/taxonomy/**", "/api/v2/items/**",
                        "/api/v2/questionnaires/**", "/api/v2/assessments/**",
                        "/api/v2/delivery/**", "/api/v2/demographic-fields/**"));
        ensureRole(UserService.ROLE_RESPONDENT, "Taking assessments via the portal",
                Set.of("/api/v2/auth/**", "/api/v2/delivery/**"));

        if (adminEmail != null && !adminEmail.isBlank()
                && !userRepository.existsByEmailIgnoreCase(adminEmail)) {
            User user = new User();
            user.setEmail(adminEmail);
            user.setName(adminName);
            if (adminDob != null && !adminDob.isBlank()) {
                user.setDob(LocalDate.parse(adminDob));
            }
            user.setSuperAdmin(true);
            user.setConsent(true);
            User saved = userRepository.save(user);
            UserRole link = new UserRole();
            link.setUser(saved);
            link.setRole(admin);
            userRoleRepository.save(link);
        }
    }

    private Role ensureRole(String name, String description, Set<String> defaultPaths) {
        return roleRepository.findByName(name).orElseGet(() -> {
            Role role = new Role();
            role.setName(name);
            role.setDescription(description);
            role.setUrlPaths(defaultPaths);
            return roleRepository.save(role);
        });
    }
}
