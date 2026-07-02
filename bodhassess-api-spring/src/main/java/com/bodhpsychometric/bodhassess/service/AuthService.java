package com.bodhpsychometric.bodhassess.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.UnauthorizedAccessException;
import com.bodhpsychometric.bodhassess.model.User;
import com.bodhpsychometric.bodhassess.model.UserMeta;
import com.bodhpsychometric.bodhassess.payload.AuthLoginRequest;
import com.bodhpsychometric.bodhassess.payload.AuthLoginResponse;
import com.bodhpsychometric.bodhassess.repository.UserMetaRepository;
import com.bodhpsychometric.bodhassess.repository.UserRepository;
import com.bodhpsychometric.bodhassess.security.TokenProvider;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Unified login against the single {@code app_users} identity table.
 *
 *   resolve by email  →  verify dob  →  check status  →  issue token.
 *
 * Token shape bridges the new identity model onto the existing authority
 * system without a security rewrite:
 *   - super admin → ADMIN user-type + the SUPER_ADMIN role (god mode), so it
 *     passes everything an admin token passes plus carries the override claim.
 *   - everyone else → RESPONDENT user-type, so the existing portal endpoints
 *     (which key off the migrated respondent row of the same id) keep working.
 *
 * Roles/RBAC are deferred; this is the seam they'll slot into later.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    @Autowired private UserRepository users;
    @Autowired private UserMetaRepository userMeta;
    @Autowired private TokenProvider tokenProvider;

    @Transactional
    public AuthLoginResponse login(AuthLoginRequest req) {
        if (req == null) throw new BadRequestException("email and dob are required");
        String email = req.resolveEmail();
        String dob = req.getDob() == null ? "" : req.getDob().trim();
        if (email.isEmpty() || dob.isEmpty()) {
            throw new BadRequestException("email and dob are required");
        }

        log.info("[login-debug] auth login attempt: email='{}' dob={}", email, dob);

        User u = users.findByEmailIgnoreCase(email).orElse(null);
        if (u == null) {
            log.warn("[login-debug] FAIL: no user with email '{}'", email);
            throw new UnauthorizedAccessException("invalid credentials");
        }
        if (!dob.equals(u.getDob() == null ? null : u.getDob().trim())) {
            log.warn("[login-debug] FAIL: dob mismatch for '{}' (stored={}, typed={})", email, u.getDob(), dob);
            throw new UnauthorizedAccessException("invalid credentials");
        }
        if (u.getStatus() != null && !"Active".equalsIgnoreCase(u.getStatus())) {
            log.warn("[login-debug] FAIL: user '{}' status={}", email, u.getStatus());
            throw new UnauthorizedAccessException("account is not active");
        }

        UserPrincipal.UserType type = u.isSuperAdmin()
                ? UserPrincipal.UserType.ADMIN
                : UserPrincipal.UserType.RESPONDENT;

        String token = tokenProvider.createToken(u.getId(), u.getEmail(), type, rolesFor(u));

        log.info("[login-debug] auth login OK: id={} superAdmin={}", u.getId(), u.isSuperAdmin());
        return new AuthLoginResponse(token, toAuthUser(u));
    }

    // Read-only tx so the lazy entityIds collection initializes within an open
    // session (toAuthUser copies it out) — otherwise LazyInitializationException.
    @Transactional(readOnly = true)
    public AuthLoginResponse.AuthUser me(UserPrincipal principal) {
        if (principal == null) throw new UnauthorizedAccessException("token required");
        User u = users.findById(principal.getId())
                .orElseThrow(() -> new UnauthorizedAccessException("user not found"));
        return toAuthUser(u);
    }

    /**
     * Authority claims for the unified identity. Super admin is god mode
     * ({@code /*} grants every dashboard route); RBAC for migrated practitioner
     * accounts will slot in here once roles live on {@code app_users}.
     */
    private List<String> rolesFor(User u) {
        return u.isSuperAdmin()
                ? Collections.singletonList("SUPER_ADMIN")
                : new ArrayList<>();
    }

    private List<String> urlPathsFor(User u) {
        return u.isSuperAdmin()
                ? Collections.singletonList("/*")
                : new ArrayList<>();
    }

    private AuthLoginResponse.AuthUser toAuthUser(User u) {
        String name = userMeta.findById(u.getId()).map(UserMeta::getName).orElse(null);
        return new AuthLoginResponse.AuthUser(
                u.getId(), u.getEmail(), name, u.isSuperAdmin(),
                u.getEntityIds() == null ? new ArrayList<>() : new ArrayList<>(u.getEntityIds()),
                rolesFor(u), urlPathsFor(u));
    }
}
