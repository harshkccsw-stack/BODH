package com.bodhpsychometric.controller.practitioner;

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

import com.bodhpsychometric.dto.PractitionerRequest;
import com.bodhpsychometric.dto.PractitionerResponse;
import com.bodhpsychometric.model.auth.PractitionerUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.auth.enums.PractitionerStatus;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;

import jakarta.validation.Valid;

/**
 * Dashboard CRUD for practitioners. Mirrors RespondentController: one
 * practitioner is two rows — the User identity (email + dob credential,
 * serialId) and the PractitionerUser profile (name, phone, status, vertical,
 * organization) — create/update write both.
 *
 * Conflicts (duplicate email) are PRE-checked with exists queries; catching
 * the flush inside @Transactional would mark the transaction rollback-only
 * and 500 at commit. Nothing FK-references practitioners yet, so delete has
 * no in-use blocker.
 */
@RestController
@RequestMapping("/api/practitioners")
@Transactional
public class PractitionerController {

    @Autowired
    private PractitionerUserRepository practitionerUserRepository;

    @Autowired
    private RespondentUserRepository respondentUserRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    @GetMapping("/getAll")
    public List<PractitionerResponse> getAllPractitioners() {
        return practitionerUserRepository.findAllForListing().stream()
                .map(PractitionerResponse::from)
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<PractitionerResponse> getPractitionerById(@PathVariable Long id) {
        return practitionerUserRepository.findById(id)
                .map(p -> ResponseEntity.ok(PractitionerResponse.from(p)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createPractitioner(@Valid @RequestBody PractitionerRequest request) {
        String email = request.email().trim();
        Organization organization = resolveOrganization(request.organizationId());
        if (request.organizationId() != null && organization == null) {
            return unknownOrganization();
        }

        // One person may hold both profiles: if the email already belongs to
        // an identity (e.g. a respondent), attach a practitioner profile to
        // that same User instead of rejecting. dob must match — it is the
        // credential, and matching it proves the admin means this person.
        User user = userRepository.findByEmailIgnoreCase(email).orElse(null);
        if (user != null) {
            if (practitionerUserRepository.existsByUser_Id(user.getId())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("message", "A practitioner with this email already exists"));
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

        PractitionerUser practitioner = new PractitionerUser();
        practitioner.setUser(user);
        apply(practitioner, request, organization);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(PractitionerResponse.from(practitionerUserRepository.save(practitioner)));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updatePractitioner(@PathVariable Long id,
            @Valid @RequestBody PractitionerRequest request) {
        PractitionerUser practitioner = practitionerUserRepository.findById(id).orElse(null);
        if (practitioner == null) {
            return ResponseEntity.notFound().build();
        }
        String email = request.email().trim();
        if (userRepository.existsByEmailIgnoreCaseAndIdNot(email, practitioner.getUser().getId())) {
            return duplicateEmail();
        }
        Organization organization = resolveOrganization(request.organizationId());
        if (request.organizationId() != null && organization == null) {
            return unknownOrganization();
        }

        User user = practitioner.getUser();
        user.setEmail(email);
        user.setDob(request.dob());
        apply(practitioner, request, organization);
        return ResponseEntity.ok(PractitionerResponse.from(practitionerUserRepository.save(practitioner)));
    }

    /**
     * Grants the superadmin flag on the practitioner's identity. Superadmin
     * sits above the role system and bypasses every permission check —
     * including the dashboard login gate.
     */
    @PutMapping("/assign-superadmin/{id}")
    public ResponseEntity<?> assignSuperAdmin(@PathVariable Long id) {
        PractitionerUser practitioner = practitionerUserRepository.findById(id).orElse(null);
        if (practitioner == null) {
            return ResponseEntity.notFound().build();
        }
        User user = practitioner.getUser();
        user.setSuperAdmin(true);
        userRepository.save(user);
        return ResponseEntity.ok(PractitionerResponse.from(practitioner));
    }

    @PutMapping("/revoke-superadmin/{id}")
    public ResponseEntity<?> revokeSuperAdmin(@PathVariable Long id) {
        PractitionerUser practitioner = practitionerUserRepository.findById(id).orElse(null);
        if (practitioner == null) {
            return ResponseEntity.notFound().build();
        }
        User user = practitioner.getUser();
        if (user.isSuperAdmin() && userRepository.countBySuperAdminTrue() <= 1) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "Cannot revoke the last superadmin — assign another one first"));
        }
        user.setSuperAdmin(false);
        userRepository.save(user);
        return ResponseEntity.ok(PractitionerResponse.from(practitioner));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deletePractitioner(@PathVariable Long id) {
        PractitionerUser practitioner = practitionerUserRepository.findById(id).orElse(null);
        if (practitioner == null) {
            return ResponseEntity.notFound().build();
        }
        User user = practitioner.getUser();
        practitionerUserRepository.delete(practitioner);
        // The identity row goes too — unless something else still needs it:
        // a respondent profile, dashboard access, or the superadmin flag.
        if (!user.isSuperAdmin() && user.getRoleGroup() == null
                && !respondentUserRepository.existsByUser_Id(user.getId())) {
            userRepository.delete(user);
        }
        return ResponseEntity.noContent().build();
    }

    private void apply(PractitionerUser practitioner, PractitionerRequest request, Organization organization) {
        practitioner.setName(request.name().trim());
        practitioner.setPhone(request.phone() == null || request.phone().isBlank()
                ? null : request.phone().trim());
        practitioner.setPractitionerStatus(request.practitionerStatus() == null
                ? PractitionerStatus.ACTIVE : request.practitionerStatus());
        practitioner.setVertical(request.vertical());
        practitioner.setOrganization(organization);
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
