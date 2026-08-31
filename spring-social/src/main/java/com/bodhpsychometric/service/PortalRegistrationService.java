package com.bodhpsychometric.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.PortalAuthResponse;
import com.bodhpsychometric.dto.PortalRegistrationResponse;
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
    private final UserRepository users;
    private final RespondentUserRepository respondents;
    private final RespondentAssessmentMappingRepository allotments;
    private final JwtService jwt;

    public PortalRegistrationService(RegistrationTokenRepository tokens, UserRepository users,
            RespondentUserRepository respondents,
            RespondentAssessmentMappingRepository allotments, JwtService jwt) {
        this.tokens = tokens;
        this.users = users;
        this.respondents = respondents;
        this.allotments = allotments;
        this.jwt = jwt;
    }

    @Transactional
    public PortalRegistrationResponse register(String token, RegistrationSubmitRequest request) {
        RegistrationToken link = tokens.findByTokenForResolve(token)
                .orElseThrow(PortalRegistrationService::invalidLink);
        if (!link.isUsable(OffsetDateTime.now())) {
            throw invalidLink();
        }

        // ── Pass 1: resolve the target and validate everything ────────────
        // The two scopes mean genuinely different things, and this is where
        // that shows: an org-wide link is "join this organization" and grants
        // no assessment at all, so `assessment` stays null and an empty
        // catalog is no obstacle. An assessment-scoped link is "join and take
        // this one", and the link alone decides which — nothing in the request
        // body can influence it.
        Organization organization;
        Assessment assessment;
        if (link.isOrganizationWide()) {
            organization = link.getOrganization();
            assessment = null;
        } else {
            OrganizationAssessmentMapping mapping = link.getOrganizationAssessmentMapping();
            organization = mapping.getOrganization();
            assessment = mapping.getAssessment();
            // The same gate RespondentAssessmentController.assign applies to
            // admins. A public link must not be a way around it.
            if (assessment.getStatus() != AssessmentStatus.ACTIVE) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This assessment is not open for registration right now.");
            }
        }

        String email = request.email().trim();
        String employeeId = normalizeEmployeeId(request.employeeId());
        User user = users.findByEmailIgnoreCase(email).orElse(null);

        // ── Pass 2: write ─────────────────────────────────────────────────
        Registrant registrant = user == null
                ? new Registrant(createIdentity(email, request, employeeId, organization), true)
                : claimIdentity(user, request, employeeId, organization);
        RespondentUser respondent = registrant.respondent();

        Allotment allotment = assessment == null ? null : allot(respondent, assessment);

        // A use is spent only when the request actually GRANTED something: a
        // new member, or an assessment this respondent did not already hold.
        // Re-submitting details that are already registered gains nothing and
        // is really just a sign-in, so it must not burn the cap — otherwise a
        // limited link could be exhausted without a single person joining.
        //
        // Both halves matter. Counting only new members would let an
        // assessment-scoped link hand the assessment to any number of existing
        // members while its counter stayed put, which would make maxUses
        // meaningless on exactly the links most likely to use it.
        boolean granted = registrant.created() || (allotment != null && allotment.created());
        if (granted && tokens.consumeOneUse(link.getRegistrationTokenId()) != 1) {
            throw invalidLink();
        }

        respondent.getUser().setLastLoginAt(OffsetDateTime.now());
        return new PortalRegistrationResponse(jwt.issueToken(respondent.getUser()),
                toPortalUser(respondent), allotment == null ? null : allotment.id());
    }

    /**
     * The allotment for an assessment-scoped link, reusing the one already
     * held if this respondent has been here before — the unique key on
     * (respondent, assessment) forbids a second, and they should be sent back
     * into the attempt they started rather than a new one.
     */
    private Allotment allot(RespondentUser respondent, Assessment assessment) {
        RespondentAssessmentMapping existing = allotments
                .findByRespondent_IdAndAssessment_AssessmentId(
                        respondent.getId(), assessment.getAssessmentId())
                .orElse(null);
        if (existing != null) {
            return new Allotment(existing.getRespondentAssessmentMappingId(), false);
        }
        RespondentAssessmentMapping created = new RespondentAssessmentMapping();
        created.setRespondent(respondent);
        created.setAssessment(assessment);
        return new Allotment(allotments.save(created).getRespondentAssessmentMappingId(), true);
    }

    /** An allotment's id plus whether this request is what created it. */
    private record Allotment(Long id, boolean created) {
    }

    /**
     * A respondent profile plus whether this request is what created it —
     * which is what decides if the link spends a use.
     */
    private record Registrant(RespondentUser respondent, boolean created) {
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
        respondent.setPhoneCountryCode(blankToNull(request.phoneCountryCode()));
        respondent.setPhone(blankToNull(request.phone()));
        respondent.setEmployeeId(employeeId);
        respondent.setGender(request.gender());
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
    private Registrant claimIdentity(User user, RegistrationSubmitRequest request,
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
            created.setPhoneCountryCode(blankToNull(request.phoneCountryCode()));
            created.setPhone(blankToNull(request.phone()));
            created.setEmployeeId(employeeId);
            created.setGender(request.gender());
            created.setOrganization(organization);
            // A new respondent profile, even though the identity existed —
            // this request added someone to the organization, so it counts.
            return new Registrant(respondents.save(created), true);
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
        // Same rule for gender and phone: fill a blank, never overwrite what is
        // already on the profile. The stored value may have come from an admin
        // who knows better than a public form, and a respondent re-using a link
        // must not be able to quietly rewrite their own record through it.
        //
        // Both are required fields on the form now, so a returning respondent
        // always sends something — which is exactly why the "never overwrite"
        // half matters more than it used to. What they type is kept only when
        // the profile has nothing yet, e.g. someone bulk-uploaded without a
        // phone number.
        if (request.gender() != null && respondent.getGender() == null) {
            respondent.setGender(request.gender());
        }
        // Keyed on the NUMBER alone, and both halves written together. A row
        // that already has a phone but no country code is an old free-text one
        // (pre-2026-08-31): filling in just the code from this form would
        // staple a country onto digits nobody said belonged to it, which is a
        // worse record than the incomplete one it replaced. Such a row is
        // brought up to shape by an edit, not by a re-used registration link.
        if (respondent.getPhone() == null) {
            respondent.setPhoneCountryCode(blankToNull(request.phoneCountryCode()));
            respondent.setPhone(blankToNull(request.phone()));
        }
        // Nobody new: this respondent already existed, so the link keeps its
        // use and the request amounts to a sign-in.
        return new Registrant(respondent, false);
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
