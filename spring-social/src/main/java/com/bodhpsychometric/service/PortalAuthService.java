package com.bodhpsychometric.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalAuthResponse;
import com.bodhpsychometric.dto.PortalLoginResponse;
import com.bodhpsychometric.dto.RespondentAssessmentResponse;
import com.bodhpsychometric.model.assessment.enums.RespondentAssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;

import io.jsonwebtoken.JwtException;

/**
 * Portal sign-in: dob is the password, and the identifier is either the email
 * (as on the dashboard) or the respondent's optional employee id. The gate is
 * holding a RespondentUser profile — practitioner-only and superadmin accounts
 * get 403 here, their dashboard flow is separate. The response carries the
 * respondent's allotted assessment attempts so the portal home renders without
 * a second call.
 */
@Service
public class PortalAuthService {

    private final UserRepository users;
    private final RespondentUserRepository respondents;
    private final RespondentAssessmentMappingRepository respondentAssessments;
    private final JwtService jwt;
    private final PortalRedisStore redis;

    public PortalAuthService(UserRepository users, RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository respondentAssessments, JwtService jwt,
            PortalRedisStore redis) {
        this.users = users;
        this.respondents = respondents;
        this.respondentAssessments = respondentAssessments;
        this.jwt = jwt;
        this.redis = redis;
    }

    /**
     * The identifier is an email or a respondent's employee id — never
     * ambiguous, because employee ids are validated alphanumeric and so can
     * never contain '@'.
     */
    @Transactional
    public PortalLoginResponse login(String identifier, LocalDate dob) {
        String trimmed = identifier == null ? "" : identifier.trim();
        RespondentUser respondent = trimmed.contains("@")
                ? byEmail(trimmed, dob)
                : byEmployeeId(trimmed, dob);

        User user = respondent.getUser();
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }
        user.setLastLoginAt(OffsetDateTime.now());

        return new PortalLoginResponse(jwt.issueToken(user), toPortalUser(respondent));
    }

    /** Email is globally unique, so this resolves to at most one identity. */
    private RespondentUser byEmail(String email, LocalDate dob) {
        // One message for unknown email and wrong dob, so the response does
        // not reveal which half was wrong.
        User user = users.findByEmailIgnoreCase(email)
                .orElseThrow(PortalAuthService::invalidCredentials);
        if (user.getDob() == null || !user.getDob().equals(dob)) {
            throw invalidCredentials();
        }
        return respondents.findByUserIdForPortal(user.getId())
                .orElseThrow(PortalAuthService::noPortalAccess);
    }

    /**
     * Employee ids are unique only WITHIN an organization, so the lookup can
     * return several rows and the login form has no organization to narrow
     * them with. The dob does that instead: the respondent already has to
     * prove it, so folding it into the match costs nothing and avoids putting
     * an organization picker (and a public list of organization names) on the
     * login screen.
     *
     * A true collision needs two people in different organizations sharing
     * both a code and a birth date; that is rejected rather than guessed at,
     * and signing in by email still works for them.
     */
    private RespondentUser byEmployeeId(String employeeId, LocalDate dob) {
        List<RespondentUser> matches = respondents.findByEmployeeIdForPortal(employeeId).stream()
                .filter(r -> dob.equals(r.getUser().getDob()))
                .toList();
        if (matches.size() != 1) {
            throw invalidCredentials();
        }
        return matches.get(0);
    }

    /**
     * Session restore: resolves a bearer token back to the signed-in
     * respondent. Same gate as login — a token whose account lost its
     * respondent profile (or was disabled) since issue stops working here.
     */
    @Transactional(readOnly = true)
    public PortalAuthResponse me(String authorizationHeader) {
        return toPortalUser(requireRespondent(authorizationHeader));
    }

    /**
     * The shared gate for every portal endpoint: bearer token in, the
     * signed-in RespondentUser out. 401 on a missing/invalid/expired token,
     * 403 when the account is disabled or holds no respondent profile.
     */
    @Transactional(readOnly = true)
    public RespondentUser requireRespondent(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            throw invalidToken();
        }
        Long userId;
        try {
            userId = jwt.parseUserId(authorizationHeader.substring("Bearer ".length()));
        } catch (JwtException | IllegalArgumentException e) {
            throw invalidToken();
        }

        User user = users.findById(userId).orElseThrow(PortalAuthService::invalidToken);
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }
        return respondents.findByUserIdForPortal(user.getId())
                .orElseThrow(PortalAuthService::noPortalAccess);
    }

    private PortalAuthResponse toPortalUser(RespondentUser respondent) {
        List<RespondentAssessmentResponse> allotted = respondentAssessments
                .findByRespondentForListing(respondent.getId()).stream()
                // submissionPending — a Redis-staged submission the digest has
                // not landed yet: the portal home shows "being processed"
                // instead of a Resume button. Only an ONGOING+unpersisted row
                // can be in that state, so the Redis check is skipped for
                // every other row rather than paid per allotment.
                .map(m -> RespondentAssessmentResponse.from(m,
                        m.getAssessmentStatus() == RespondentAssessmentStatus.ONGOING
                                && !m.isPersisted()
                                && redis.hasPendingSubmission(m.getRespondentAssessmentMappingId())))
                .toList();
        return PortalAuthResponse.from(respondent, allotted);
    }

    private static ResponseStatusException noPortalAccess() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only respondent accounts can access the portal");
    }

    private static ResponseStatusException invalidCredentials() {
        // Deliberately vague: unknown identifier, wrong dob, and an employee id
        // that matched more than one person all read the same from outside.
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    }

    private static ResponseStatusException invalidToken() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
    }
}
