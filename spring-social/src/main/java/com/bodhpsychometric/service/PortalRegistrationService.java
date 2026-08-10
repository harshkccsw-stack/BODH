package com.bodhpsychometric.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalAuthResponse;
import com.bodhpsychometric.dto.PortalLoginResponse;
import com.bodhpsychometric.dto.RegistrationSubmitRequest;
import com.bodhpsychometric.dto.RespondentAssessmentResponse;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.OrganizationAssessmentMapping;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.model.organization.RegistrationToken;
import com.bodhpsychometric.repository.assessment.OrganizationAssessmentMappingRepository;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;
import com.bodhpsychometric.repository.organization.RegistrationTokenRepository;

/**
 * Self-registration through a shared link: the whole thing — resolve the link,
 * create or claim the identity, join the organization, allot the assessment,
 * and sign the respondent in — in ONE transaction, so a half-registered person
 * cannot exist.
 *
 * Deliberately a service and not controller code, unlike most of this project.
 * The duplicate-email race can only be answered with a 409 if the
 * DataIntegrityViolationException is caught OUTSIDE the transaction: catching
 * it inside marks the transaction rollback-only and 500s at commit even after
 * a 409 has been returned. That boundary is why the controller stays thin.
 *
 * Validation is one pass over everything before a single row is written, the
 * same shape the bulk endpoints use.
 */
@Service
public class PortalRegistrationService {

    private final RegistrationTokenRepository tokens;
    private final OrganizationAssessmentMappingRepository catalog;
    private final UserRepository users;
    private final RespondentUserRepository respondents;
    private final RespondentAssessmentMappingRepository allotments;
    private final JwtService jwt;

    public PortalRegistrationService(RegistrationTokenRepository tokens,
            OrganizationAssessmentMappingRepository catalog, UserRepository users,
            RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository allotments, JwtService jwt) {
        this.tokens = tokens;
        this.catalog = catalog;
        this.users = users;
        this.respondents = respondents;
        this.allotments = allotments;
        this.jwt = jwt;
    }

    @Transactional
    public PortalLoginResponse register(String token, RegistrationSubmitRequest request) {
        RegistrationToken link = tokens.findByTokenForResolve(token)
                .orElseThrow(PortalRegistrationService::invalidLink);
        if (!link.isUsable(OffsetDateTime.now())) {
            throw invalidLink();
        }

        // ── Pass 1: resolve the target and validate everything ────────────
        OrganizationAssessmentMapping mapping = resolveMapping(link, request.assessmentId());
        Organization organization = mapping.getOrganization();
        Assessment assessment = mapping.getAssessment();
        // The same gate RespondentAssessmentController.assign applies to
        // admins. A public link must not be a way around it.
        if (assessment.getStatus() != AssessmentStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This assessment is not open for registration right now.");
        }

        String email = request.email().trim();
        String employeeId = normalizeEmployeeId(request.employeeId());
        User user = users.findByEmailIgnoreCase(email).orElse(null);

        // ── Pass 2: write ─────────────────────────────────────────────────
        RespondentUser respondent = user == null
                ? createIdentity(email, request, employeeId, organization)
                : claimIdentity(user, request, employeeId, organization);

        if (!allotments.existsByRespondent_IdAndAssessment_AssessmentId(
                respondent.getId(), assessment.getAssessmentId())) {
            RespondentAssessmentMapping allotment = new RespondentAssessmentMapping();
            allotment.setRespondent(respondent);
            allotment.setAssessment(assessment);
            allotments.save(allotment);
        }

        // Last, so a link is only spent on a registration that actually
        // happened — anything above throwing rolls this back with it.
        if (tokens.consumeOneUse(link.getRegistrationTokenId()) != 1) {
            throw invalidLink();
        }

        respondent.getUser().setLastLoginAt(OffsetDateTime.now());
        return new PortalLoginResponse(jwt.issueToken(respondent.getUser()), toPortalUser(respondent));
    }

    /**
     * Which catalog entry this registration is for. An assessment-scoped link
     * already answers it; an org-wide link makes the respondent choose, and
     * the choice is re-checked against the catalog because a body can claim
     * any id it likes.
     */
    private OrganizationAssessmentMapping resolveMapping(RegistrationToken link, Long assessmentId) {
        if (!link.isOrganizationWide()) {
            OrganizationAssessmentMapping fixed = link.getOrganizationAssessmentMapping();
            // Silently overriding a mismatch would hide a client bug, and
            // honouring it would let the body pick the assessment.
            if (assessmentId != null
                    && !assessmentId.equals(fixed.getAssessment().getAssessmentId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This link is for a specific assessment and cannot be changed.");
            }
            return fixed;
        }
        if (assessmentId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Choose an assessment to continue.");
        }
        return catalog.findByOrganization_OrganizationIdAndAssessment_AssessmentId(
                link.getOrganization().getOrganizationId(), assessmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "That assessment is not available on this link."));
    }

    /** Nobody holds this email — a clean new identity plus respondent profile. */
    private RespondentUser createIdentity(String email, RegistrationSubmitRequest request,
            String employeeId, Organization organization) {
        requireEmployeeIdFree(employeeId, organization, null);

        User user = new User();
        user.setEmail(email);
        user.setDob(request.dob());
        user.setAccountStatus(true);
        user = users.save(user);
        // Derived from the generated id, so it can only be set after the
        // insert — same rule as RespondentController and the seeder.
        user.setSerialId(String.format("USR-%06d", user.getId()));

        RespondentUser respondent = new RespondentUser();
        respondent.setUser(user);
        respondent.setName(request.name().trim());
        respondent.setPhone(blankToNull(request.phone()));
        respondent.setEmployeeId(employeeId);
        respondent.setOrganization(organization);
        // Consent stays false: the take flow's terms step is what records it,
        // and a registration form is not where that decision belongs.
        return respondents.save(respondent);
    }

    /**
     * The email already belongs to someone. dob is the credential, so matching
     * it is what proves this is the same person rather than someone claiming
     * their address — and it is checked before anything else is revealed.
     */
    private RespondentUser claimIdentity(User user, RegistrationSubmitRequest request,
            String employeeId, Organization organization) {
        if (user.getDob() == null || !user.getDob().equals(request.dob())) {
            // Never says which half was wrong, and never touches the stored dob.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with this email already exists — sign in instead.");
        }
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }

        RespondentUser respondent = respondents.findByUserIdForPortal(user.getId()).orElse(null);
        if (respondent == null) {
            // A known identity with no respondent profile — a practitioner
            // registering as a respondent, say. Attach one to the SAME user
            // rather than refusing; one person, one account.
            requireEmployeeIdFree(employeeId, organization, null);
            RespondentUser created = new RespondentUser();
            created.setUser(user);
            created.setName(request.name().trim());
            created.setPhone(blankToNull(request.phone()));
            created.setEmployeeId(employeeId);
            created.setOrganization(organization);
            return respondents.save(created);
        }

        Organization current = respondent.getOrganization();
        if (current == null) {
            respondent.setOrganization(organization);
        } else if (!current.getOrganizationId().equals(organization.getOrganizationId())) {
            // Membership is single, and moving someone takes their whole
            // history with them — far too much for a public form to decide.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This account already belongs to another organization — "
                            + "contact your administrator.");
        }

        // A public form may FILL an empty employee code but never overwrite
        // one an admin set: the stored code is authoritative, and a mismatch
        // here is not worth blocking an otherwise valid registration over.
        if (employeeId != null && respondent.getEmployeeId() == null) {
            requireEmployeeIdFree(employeeId, organization, respondent.getId());
            respondent.setEmployeeId(employeeId);
        }
        return respondent;
    }

    /**
     * Employee ids are unique per organization. Pre-checked rather than caught:
     * a constraint violation inside this transaction would 500 at commit even
     * after a 409 was returned.
     */
    private void requireEmployeeIdFree(String employeeId, Organization organization, Long excludeId) {
        if (employeeId == null) {
            return;
        }
        if (respondents.countByEmployeeIdInOrganization(
                employeeId, organization.getOrganizationId(), excludeId) > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This Employee ID is already in use in this organization");
        }
    }

    private PortalAuthResponse toPortalUser(RespondentUser respondent) {
        List<RespondentAssessmentResponse> allotted = allotments
                .findByRespondentForListing(respondent.getId()).stream()
                .map(RespondentAssessmentResponse::from)
                .toList();
        return PortalAuthResponse.from(respondent, allotted);
    }

    /** Stored upper-cased, matching what the dashboard writes. */
    private static String normalizeEmployeeId(String employeeId) {
        return employeeId == null || employeeId.isBlank() ? null
                : employeeId.trim().toUpperCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Unknown, revoked, expired and exhausted all read the same from outside. */
    private static ResponseStatusException invalidLink() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND,
                "This registration link is not valid or has expired.");
    }
}
