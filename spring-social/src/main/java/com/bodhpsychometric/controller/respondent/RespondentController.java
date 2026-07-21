package com.bodhpsychometric.controller.respondent;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.RespondentRequest;
import com.bodhpsychometric.dto.RespondentResponse;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;

import jakarta.validation.Valid;

/**
 * Dashboard CRUD for respondents. One respondent is two rows: the User
 * identity (email + dob credential, serialId) and the RespondentUser profile
 * (name, phone, gender, consent, organization) — create/update write both.
 *
 * Conflicts (duplicate email, delete-with-attempts) are PRE-checked with
 * exists queries; catching the flush inside @Transactional would mark the
 * transaction rollback-only and 500 at commit.
 */
@RestController
@RequestMapping("/api/respondents")
@Transactional
public class RespondentController {

    @Autowired
    private RespondentUserRepository respondentUserRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PractitionerUserRepository practitionerUserRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @Autowired
    private RespondentAssessmentMappingRepository respondentAssessmentMappingRepository;

    @GetMapping("/getAll")
    public List<RespondentResponse> getAllRespondents() {
        return respondentUserRepository.findAllForListing().stream()
                .map(RespondentResponse::from)
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<RespondentResponse> getRespondentById(@PathVariable Long id) {
        return respondentUserRepository.findById(id)
                .map(r -> ResponseEntity.ok(RespondentResponse.from(r)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createRespondent(@Valid @RequestBody RespondentRequest request) {
        String email = request.email().trim();
        Organization organization = resolveOrganization(request.organizationId());
        if (request.organizationId() != null && organization == null) {
            return unknownOrganization();
        }

        // One person may hold both profiles: if the email already belongs to
        // an identity (e.g. a practitioner), attach a respondent profile to
        // that same User instead of rejecting. dob must match — it is the
        // credential, and matching it proves the admin means this person.
        User user = userRepository.findByEmailIgnoreCase(email).orElse(null);
        if (user != null) {
            if (respondentUserRepository.existsByUser_Id(user.getId())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "A respondent with this email already exists"));
            }
            if (!user.getDob().equals(request.dob())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message",
                                "A user with this email exists but the date of birth does not match"));
            }
        } else {
            user = new User();
            user.setEmail(email);
            user.setDob(request.dob());
            user.setAccountStatus(true);
            user = userRepository.save(user);
            // serialId derives from the generated id — same rule as the seeder.
            user.setSerialId(String.format("USR-%06d", user.getId()));
        }

        RespondentUser respondent = new RespondentUser();
        respondent.setUser(user);
        apply(respondent, request, organization);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(RespondentResponse.from(respondentUserRepository.save(respondent)));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateRespondent(@PathVariable Long id,
            @Valid @RequestBody RespondentRequest request) {
        RespondentUser respondent = respondentUserRepository.findById(id).orElse(null);
        if (respondent == null) {
            return ResponseEntity.notFound().build();
        }
        String email = request.email().trim();
        if (userRepository.existsByEmailIgnoreCaseAndIdNot(email, respondent.getUser().getId())) {
            return duplicateEmail();
        }
        Organization organization = resolveOrganization(request.organizationId());
        if (request.organizationId() != null && organization == null) {
            return unknownOrganization();
        }

        User user = respondent.getUser();
        user.setEmail(email);
        user.setDob(request.dob());
        apply(respondent, request, organization);
        return ResponseEntity.ok(RespondentResponse.from(respondentUserRepository.save(respondent)));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteRespondent(@PathVariable Long id) {
        RespondentUser respondent = respondentUserRepository.findById(id).orElse(null);
        if (respondent == null) {
            return ResponseEntity.notFound().build();
        }
        if (respondentAssessmentMappingRepository.existsByRespondent_Id(id)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "This respondent has assessment attempts and cannot be deleted"));
        }
        User user = respondent.getUser();
        respondentUserRepository.delete(respondent);
        // The identity row goes too — unless something else still needs it:
        // a practitioner profile, dashboard access, or the superadmin flag.
        if (!user.isSuperAdmin() && user.getRoleGroup() == null
                && !practitionerUserRepository.existsByUser_Id(user.getId())) {
            userRepository.delete(user);
        }
        return ResponseEntity.noContent().build();
    }

    /** Consent transitions own consentedAt: first grant stamps it, revoke clears it. */
    private void apply(RespondentUser respondent, RespondentRequest request, Organization organization) {
        respondent.setName(request.name().trim());
        respondent.setPhone(request.phone() == null || request.phone().isBlank()
                ? null : request.phone().trim());
        respondent.setGender(request.gender());
        respondent.setOrganization(organization);
        if (request.isConsented()) {
            if (!respondent.isConsented() || respondent.getConsentedAt() == null) {
                respondent.setConsentedAt(OffsetDateTime.now());
            }
            respondent.setConsented(true);
        } else {
            respondent.setConsented(false);
            respondent.setConsentedAt(null);
        }
    }

    private Organization resolveOrganization(Long organizationId) {
        return organizationId == null ? null
                : organizationRepository.findById(organizationId).orElse(null);
    }

    private ResponseEntity<Map<String, String>> duplicateEmail() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "A user with this email already exists"));
    }

    private ResponseEntity<Map<String, String>> unknownOrganization() {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "Organization not found"));
    }
}
