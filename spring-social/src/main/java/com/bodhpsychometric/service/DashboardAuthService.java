package com.bodhpsychometric.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.AuthUserResponse;
import com.bodhpsychometric.dto.LoginResponse;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.auth.UserRepository;

import io.jsonwebtoken.JwtException;

/**
 * Dashboard sign-in: email + dob against the User row. This endpoint only
 * issues tokens to accounts that may open the dashboard — respondent-only
 * accounts get 403 here; their portal flow is separate.
 */
@Service
public class DashboardAuthService {

    private final UserRepository users;
    private final JwtService jwt;

    public DashboardAuthService(UserRepository users, JwtService jwt) {
        this.users = users;
        this.jwt = jwt;
    }

    @Transactional
    public LoginResponse login(String email, LocalDate dob) {
        // One message for unknown email and wrong dob, so the response does
        // not reveal which half was wrong.
        User user = users.findByEmailIgnoreCase(email)
                .orElseThrow(DashboardAuthService::invalidCredentials);
        if (user.getDob() == null || !user.getDob().equals(dob)) {
            throw invalidCredentials();
        }
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }

        boolean dashboardAccess = user.isSuperAdmin() || user.getRoleGroup() != null;
        if (!dashboardAccess) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No dashboard access");
        }

        Set<String> urlPaths = user.getRoleGroup() != null
                ? user.getRoleGroup().allUrlPaths()
                : Set.of();

        user.setLastLoginAt(OffsetDateTime.now());

        return new LoginResponse(jwt.issueToken(user), toAuthUser(user, urlPaths));
    }

    /**
     * Session restore: resolves a bearer token back to the signed-in identity.
     * Same gate as login — a token whose account lost dashboard access (or was
     * disabled) since issue stops working here.
     */
    @Transactional(readOnly = true)
    public AuthUserResponse me(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw invalidToken();
        }
        Long userId;
        try {
            userId = jwt.parseUserId(authorizationHeader.substring("Bearer ".length()));
        } catch (JwtException | IllegalArgumentException e) {
            throw invalidToken();
        }

        User user = users.findById(userId).orElseThrow(DashboardAuthService::invalidToken);
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }
        if (!user.isSuperAdmin() && user.getRoleGroup() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No dashboard access");
        }

        Set<String> urlPaths = user.getRoleGroup() != null
                ? user.getRoleGroup().allUrlPaths()
                : Set.of();
        return toAuthUser(user, urlPaths);
    }

    private static AuthUserResponse toAuthUser(User user, Set<String> urlPaths) {
        return new AuthUserResponse(user.getId(), user.getSerialId(), user.getEmail(),
                user.isSuperAdmin(), true, urlPaths);
    }

    private static ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or date of birth");
    }

    private static ResponseStatusException invalidToken() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
    }
}
