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
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;

import io.jsonwebtoken.JwtException;

/**
 * Portal sign-in: same email + dob credential as the dashboard, but the gate
 * is holding a RespondentUser profile — practitioner-only and superadmin
 * accounts get 403 here, their dashboard flow is separate. The response
 * carries the respondent's allotted assessment attempts so the portal home
 * renders without a second call.
 */
@Service
public class PortalAuthService {

    private final UserRepository users;
    private final RespondentUserRepository respondents;
    private final RespondentAssessmentMappingRepository respondentAssessments;
    private final JwtService jwt;

    public PortalAuthService(UserRepository users, RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository respondentAssessments, JwtService jwt) {
        this.users = users;
        this.respondents = respondents;
        this.respondentAssessments = respondentAssessments;
        this.jwt = jwt;
    }

    @Transactional
    public PortalLoginResponse login(String email, LocalDate dob) {
        // One message for unknown email and wrong dob, so the response does
        // not reveal which half was wrong.
        User user = users.findByEmailIgnoreCase(email)
                .orElseThrow(PortalAuthService::invalidCredentials);
        if (user.getDob() == null || !user.getDob().equals(dob)) {
            throw invalidCredentials();
        }
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }

        RespondentUser respondent = respondents.findByUserIdForPortal(user.getId())
                .orElseThrow(PortalAuthService::noPortalAccess);

        user.setLastLoginAt(OffsetDateTime.now());

        return new PortalLoginResponse(jwt.issueToken(user), toPortalUser(respondent));
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
                .map(RespondentAssessmentResponse::from)
                .toList();
        return PortalAuthResponse.from(respondent, allotted);
    }

    private static ResponseStatusException noPortalAccess() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Only respondent accounts can access the portal");
    }

    private static ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or date of birth");
    }

    private static ResponseStatusException invalidToken() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
    }
}
