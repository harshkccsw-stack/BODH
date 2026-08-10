package com.bodhpsychometric.controller.registration;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
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

import com.bodhpsychometric.dto.OrganizationRegistrationLinksResponse;
import com.bodhpsychometric.dto.OrganizationRegistrationLinksResponse.AssessmentLink;
import com.bodhpsychometric.dto.RegistrationLinkRequest;
import com.bodhpsychometric.dto.RegistrationLinkResponse;
import com.bodhpsychometric.dto.RegistrationLinkStatusRequest;
import com.bodhpsychometric.dto.RegistrationTokenDetailResponse;
import com.bodhpsychometric.dto.RegistrationTokenDetailResponse.Scope;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.OrganizationAssessmentMapping;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.model.organization.RegistrationToken;
import com.bodhpsychometric.model.organization.enums.RegistrationTokenStatus;
import com.bodhpsychometric.repository.assessment.OrganizationAssessmentMappingRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;
import com.bodhpsychometric.repository.organization.RegistrationTokenRepository;

import jakarta.validation.Valid;

/**
 * Self-registration links: one PUBLIC endpoint the portal's /register/{token}
 * page calls, and the admin endpoints that mint and manage them.
 *
 * getByToken is UNAUTHENTICATED BY DESIGN — the token in the path IS the
 * credential, and a respondent following the link has no account yet to
 * authenticate with. It only reads, and only the two facts the form needs
 * (which organization, and which assessment if the link names one); lifecycle
 * metadata such as the use
 * count and expiry is withheld there and returned only by the admin reads
 * below.
 *
 * SECURITY: nothing in this project has an auth filter yet, so the admin
 * endpoints here are as open as the public one. They mint credentials that
 * create accounts — when Spring Security lands, everything except
 * getByToken must be behind it.
 *
 * Links are never returned as URLs, only as bare tokens. The portal's origin
 * is a deployment fact; the dashboard composes the URL from its own env.
 */
@RestController
@RequestMapping("/api/registration-tokens")
@Transactional
public class RegistrationTokenController {

    /** One instance: SecureRandom is thread-safe and seeding it per call is waste. */
    private static final SecureRandom RANDOM = new SecureRandom();

    /** 32 bytes → 43 Base64url chars. Matches the column width exactly. */
    private static final int TOKEN_BYTES = 32;

    @Autowired
    private RegistrationTokenRepository registrationTokenRepository;

    @Autowired
    private OrganizationAssessmentMappingRepository organizationAssessmentMappingRepository;

    @Autowired
    private OrganizationRepository organizationRepository;

    // ── Public: the respondent's link ─────────────────────────────────────

    /**
     * Resolve a link into the page's contents — a single query for the token
     * and whichever of its two targets is set, for both scopes.
     */
    @GetMapping("/getByToken/{token}")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getRegistrationTokenByToken(@PathVariable String token) {
        RegistrationToken link = registrationTokenRepository.findByTokenForResolve(token).orElse(null);
        // Unknown, revoked, expired and used-up all answer identically: naming
        // the reason would confirm to a prober that their guess was a real
        // token, which is the one thing the 43-char random string is hiding.
        if (link == null || !link.isUsable(OffsetDateTime.now())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "This registration link is not valid or has expired."));
        }
        return link.isOrganizationWide() ? organizationWide(link) : assessmentScoped(link);
    }

    /**
     * Assessment-scoped link: the mapping row fixes both the organization and
     * the assessment, so nothing is chosen on the form — the page shows the
     * assessment as already selected.
     */
    private ResponseEntity<?> assessmentScoped(RegistrationToken link) {
        OrganizationAssessmentMapping mapping = link.getOrganizationAssessmentMapping();
        Assessment assessment = mapping.getAssessment();
        // Mirrors the rule RespondentAssessmentController.assign enforces for
        // admins: an INACTIVE assessment cannot be handed out. A link must not
        // be a way around that.
        if (assessment.getStatus() != AssessmentStatus.ACTIVE) {
            return unavailable("This assessment is not open for registration right now.");
        }
        Organization organization = mapping.getOrganization();
        return ResponseEntity.ok(new RegistrationTokenDetailResponse(
                link.getToken(),
                Scope.ASSESSMENT,
                organization.getOrganizationId(),
                organization.getName(),
                organization.getLogoBase64(),
                assessment.getAssessmentId(),
                assessment.getName()));
    }

    /**
     * Org-wide link: joining the organization, nothing more. No assessment is
     * named because none is granted — an administrator assigns afterwards.
     *
     * Note what is NOT here: the organization's catalog is not read and an
     * empty one is not an error. It used to 409 with "no assessments open for
     * registration", which was exactly backwards for this flow — it would kill
     * the link for a newly-created organization, the case that most needs one.
     */
    private ResponseEntity<?> organizationWide(RegistrationToken link) {
        Organization organization = link.getOrganization();
        return ResponseEntity.ok(new RegistrationTokenDetailResponse(
                link.getToken(),
                Scope.ORGANIZATION,
                organization.getOrganizationId(),
                organization.getName(),
                organization.getLogoBase64(),
                null,
                null));
    }

    // ── Admin: minting and managing links ─────────────────────────────────

    /**
     * Every link this organization could have — the org-wide one plus a row
     * per catalog entry — with `link` null where none has been minted. That is
     * exactly the list the wizard's step 3 draws, un-minted rows included, so
     * the page never has to subtract existing links from the catalog itself.
     */
    @GetMapping("/getByOrganization/{organizationId}")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getRegistrationLinksByOrganization(@PathVariable Long organizationId) {
        Organization organization = organizationRepository.findById(organizationId).orElse(null);
        if (organization == null) {
            return ResponseEntity.notFound().build();
        }
        // Index the assessment-scoped links by their mapping so the catalog
        // can be walked once instead of scanned per row.
        Map<Long, RegistrationToken> byMapping = new HashMap<>();
        for (RegistrationToken link : registrationTokenRepository
                .findAssessmentScopedForOrganization(organizationId)) {
            byMapping.put(link.getOrganizationAssessmentMapping().getOrganizationAssessmentMappingId(),
                    link);
        }

        List<AssessmentLink> assessments = new ArrayList<>();
        for (OrganizationAssessmentMapping mapping : organizationAssessmentMappingRepository
                .findForOrganizationCatalog(organizationId)) {
            Assessment assessment = mapping.getAssessment();
            RegistrationToken link = byMapping.get(mapping.getOrganizationAssessmentMappingId());
            assessments.add(new AssessmentLink(
                    assessment.getAssessmentId(),
                    assessment.getName(),
                    assessment.getStatus(),
                    link == null ? null : RegistrationLinkResponse.from(link)));
        }
        assessments.sort(Comparator.comparing(AssessmentLink::assessmentName,
                String.CASE_INSENSITIVE_ORDER));

        return ResponseEntity.ok(new OrganizationRegistrationLinksResponse(
                organization.getOrganizationId(),
                organization.getName(),
                registrationTokenRepository.findOrganizationWide(organizationId)
                        .map(RegistrationLinkResponse::from).orElse(null),
                assessments));
    }

    /**
     * Mint a link. `assessmentId` chooses the scope: null for the org-wide
     * link, an id for that catalog entry.
     *
     * The duplicate checks restate uqRtOrganization and
     * uqRtOrganizationAssessmentMapping rather than leaning on them, because a
     * constraint violation inside @Transactional marks the transaction
     * rollback-only and 500s at commit even after this returns 409.
     */
    @PostMapping("/generate")
    public ResponseEntity<?> generateRegistrationLink(@Valid @RequestBody RegistrationLinkRequest request) {
        Organization organization = organizationRepository.findById(request.organizationId()).orElse(null);
        if (organization == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "Organization not found"));
        }

        RegistrationToken link = new RegistrationToken();
        if (request.assessmentId() == null) {
            if (registrationTokenRepository.existsByOrganization_OrganizationId(
                    request.organizationId())) {
                return conflict("This organization already has a registration link");
            }
            link.setOrganization(organization);
        } else {
            OrganizationAssessmentMapping mapping = organizationAssessmentMappingRepository
                    .findByOrganization_OrganizationIdAndAssessment_AssessmentId(
                            request.organizationId(), request.assessmentId())
                    .orElse(null);
            if (mapping == null) {
                return ResponseEntity.badRequest().body(Map.of("message",
                        "That assessment is not mapped to this organization — map it first"));
            }
            if (registrationTokenRepository
                    .existsByOrganizationAssessmentMapping_OrganizationAssessmentMappingId(
                            mapping.getOrganizationAssessmentMappingId())) {
                return conflict("This assessment already has a registration link in this organization");
            }
            // Only the mapping is set: it already carries the organization,
            // and ckRtScope forbids setting both.
            link.setOrganizationAssessmentMapping(mapping);
        }

        link.setToken(mintToken());
        link.setStatus(RegistrationTokenStatus.ACTIVE);
        link.setMaxUses(request.maxUses());
        link.setExpiresAt(request.expiresAt());
        link.setCreatedAt(OffsetDateTime.now());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(RegistrationLinkResponse.from(registrationTokenRepository.save(link)));
    }

    /**
     * Replace the token string in place — the answer to a leaked URL. The old
     * link stops working immediately and the use count restarts, because the
     * count belongs to the string that was shared, not to the target. The
     * limits (max uses, expiry) are the target's policy and carry over, and
     * the link is re-activated: rotating a paused link means you intend to
     * hand out the new one.
     */
    @PostMapping("/rotate/{id}")
    public ResponseEntity<?> rotateRegistrationLink(@PathVariable Long id) {
        RegistrationToken link = registrationTokenRepository.findById(id).orElse(null);
        if (link == null) {
            return ResponseEntity.notFound().build();
        }
        link.setToken(mintToken());
        link.setUsedCount(0);
        link.setStatus(RegistrationTokenStatus.ACTIVE);
        return ResponseEntity.ok(RegistrationLinkResponse.from(registrationTokenRepository.save(link)));
    }

    /** Pause or resume without destroying the link — the URL survives. */
    @PutMapping("/setStatus/{id}")
    public ResponseEntity<?> setRegistrationLinkStatus(@PathVariable Long id,
            @Valid @RequestBody RegistrationLinkStatusRequest request) {
        RegistrationToken link = registrationTokenRepository.findById(id).orElse(null);
        if (link == null) {
            return ResponseEntity.notFound().build();
        }
        link.setStatus(request.status());
        return ResponseEntity.ok(RegistrationLinkResponse.from(registrationTokenRepository.save(link)));
    }

    /**
     * Destroy the link. Nothing references it — respondents who registered
     * through it are ordinary members afterwards — so this is a plain delete
     * with no pre-check. It frees the target's unique-key slot, so a fresh
     * link can be generated for it.
     */
    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteRegistrationLink(@PathVariable Long id) {
        if (!registrationTokenRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        registrationTokenRepository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * 32 bytes of SecureRandom as Base64url without padding — 43 characters,
     * exactly the column width. Anything guessable here is an open door: this
     * string is the only thing gating an endpoint that creates accounts.
     *
     * The retry loop is not really about collisions (256 bits will not
     * collide); it is so that a bug making the generator repeat itself fails
     * loudly here instead of as a constraint violation at commit.
     */
    private String mintToken() {
        byte[] bytes = new byte[TOKEN_BYTES];
        for (int attempt = 0; attempt < 5; attempt++) {
            RANDOM.nextBytes(bytes);
            String candidate = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            if (!registrationTokenRepository.existsByToken(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Could not mint a unique registration token");
    }

    /**
     * The link itself is fine — the catalog behind it is not. Separated from
     * the 404 on purpose: this is an admin's configuration mistake, and both
     * the respondent and whoever they call about it need to be able to tell
     * the two apart. It does confirm the token was real, which is acceptable
     * only because guessing one is not.
     */
    private ResponseEntity<Map<String, String>> unavailable(String message) {
        return conflict(message);
    }

    private ResponseEntity<Map<String, String>> conflict(String message) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", message));
    }
}
