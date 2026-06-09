package com.bodhpsychometric.bodhassess.service;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.AssessmentToken;
import com.bodhpsychometric.bodhassess.model.Respondent;
import com.bodhpsychometric.bodhassess.model.User;
import com.bodhpsychometric.bodhassess.payload.AssessmentTokenDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentTokenRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentRepository;
import com.bodhpsychometric.bodhassess.repository.UserRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Issues + resolves the opaque registration tokens behind the
 * invite/copy-link popup. Tokens are 32 random bytes encoded as URL-safe
 * Base64 — no embedded JSON / no signing key needed, since the token is
 * just an opaque lookup key into the database.
 *
 * Token scope: assessmentId is always set. entityId, groupId, and
 * respondentId are optional and define what the registrant joins when
 * they consume the token. usedCount + maxUses cap how many registrations
 * a single link can produce; null maxUses = unlimited.
 */
@Service
@Transactional
public class AssessmentTokenService {

    private static final SecureRandom RNG = new SecureRandom();

    @Autowired private AssessmentTokenRepository tokens;
    @Autowired private AssessmentRepository assessments;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private RespondentGroupRepository groups;
    @Autowired private AuditService audit;
    @Autowired private QrCodeService qrCodes;
    @Autowired private RespondentRepository respondents;
    @Autowired private UserRepository users;
    @Autowired private PortalSessionRepository sessions;
    @Autowired private SessionProvisioningService sessionProvisioning;

    // Base URL the registration link points at, e.g. https://admin.bodh.biz.
    // Used to build the link the QR code encodes server-side. Callers may
    // override it per-request (dev origins differ from prod); empty default
    // means "use whatever the caller passes".
    @Value("${app.public-base-url:}")
    private String publicBaseUrl;

    /**
     * Get-or-create. The copy-link / invite popup calls this on every click.
     * Every link is a persisted token (so it carries a QR, shows in the saved
     * list, and can be revoked). The token's {@code kind} — derived from
     * whether it is bound to a respondent — tells the public /register page
     * what to do when the link is opened:
     *
     *   - "login"    → the recipient is ALREADY a known account. The assessment
     *                  is assigned to them now (idempotent session provisioning)
     *                  and the public page shows a "sign in & begin" step rather
     *                  than the registration form. Covers a pre-bound
     *                  respondentId (entity member or allotted individual) and a
     *                  standalone email that maps to an existing user.
     *   - "register" → entity-wide, group, or a standalone email with no
     *                  existing account. The recipient fills the form.
     *
     * To satisfy "the link is generated once, not again and again" we reuse a
     * live token for the same scope (and, for standalone, the same email)
     * rather than minting a fresh one.
     */
    public AssessmentTokenDto issue(AssessmentTokenDto req) {
        if (req.getAssessmentId() == null
                || !assessments.findById(req.getAssessmentId()).isPresent()) {
            throw new BadRequestException("Valid assessmentId required");
        }
        String entityId = blankToNull(req.getEntityId());
        String groupId = blankToNull(req.getGroupId());
        String respondentId = blankToNull(req.getRespondentId());
        String email = blankToNull(req.getEmail());

        // Case A — pre-bound to a known respondent (entity-member drill-in or
        // an allotted individual): a sign-in link. Assign the session now and
        // persist a respondent-scoped token (keeps the entity context, if any).
        if (respondentId != null) {
            return respondentLoginToken(req, entityId, respondentId, null);
        }

        // Case B — standalone invite (no entity/group scope). Decide by email
        // whether the recipient is already a known user.
        boolean standalone = entityId == null && groupId == null;
        if (standalone) {
            if (email == null) {
                throw new BadRequestException("email is required for a standalone link");
            }
            User known = users.findByEmailIgnoreCase(email).orElse(null);
            if (known != null) {
                // Existing account → assign + sign-in link (user id == respondent id).
                return respondentLoginToken(req, null, known.getId(), email);
            }
            // New person → register token, reused per (assessment, email).
            for (AssessmentToken existing : tokens.findStandaloneByEmail(req.getAssessmentId(), email)) {
                if (isLive(existing)) return toDto(existing);
            }
            return toDto(createToken(req, null, null, null, email));
        }

        // Case C — entity-wide or group link. Reuse a live token for the scope.
        for (AssessmentToken existing : tokens.findByScope(req.getAssessmentId(), entityId, groupId, null)) {
            if (isLive(existing)) return toDto(existing);
        }
        return toDto(createToken(req, entityId, groupId, null, null));
    }

    /**
     * Sign-in link for a known respondent. Assigns the session now (idempotent),
     * then reuses or persists a respondent-scoped token so the link carries a QR
     * and appears in the saved list — the same machinery as a register link.
     * resolve() flags it kind=login so the public page shows "sign in & begin".
     */
    private AssessmentTokenDto respondentLoginToken(AssessmentTokenDto req, String entityId,
                                                    String respondentId, String email) {
        sessionProvisioning.provisionRespondent(req.getAssessmentId(), respondentId);
        for (AssessmentToken existing : tokens.findByScope(req.getAssessmentId(), entityId, null, respondentId)) {
            if (isLive(existing)) return toDto(existing);
        }
        return toDto(createToken(req, entityId, null, respondentId, email));
    }

    /** Mint + persist a token (/register?token=…) and audit it. */
    private AssessmentToken createToken(AssessmentTokenDto req, String entityId,
                                        String groupId, String respondentId, String email) {
        AssessmentToken t = new AssessmentToken();
        t.setToken(randomToken());
        t.setAssessmentId(req.getAssessmentId());
        t.setEntityId(entityId);
        t.setGroupId(groupId);
        t.setRespondentId(respondentId);
        t.setEmail(email);
        t.setMaxUses(req.getMaxUses());
        t.setUsedCount(0);
        if (req.getExpiresAt() != null && !req.getExpiresAt().isEmpty()) {
            try { t.setExpiresAt(OffsetDateTime.parse(req.getExpiresAt())); }
            catch (Exception ex) {
                throw new BadRequestException("expiresAt must be ISO-8601");
            }
        }
        t.setCreatedBy(currentActorId());
        AssessmentToken saved = tokens.save(t);

        Map<String, Object> snap = new HashMap<>();
        snap.put("token", saved.getToken());
        snap.put("assessmentId", saved.getAssessmentId());
        snap.put("entityId", saved.getEntityId());
        snap.put("groupId", saved.getGroupId());
        snap.put("respondentId", saved.getRespondentId());
        snap.put("email", saved.getEmail());
        audit.record("TOKEN_ISSUED", "assessment_token", saved.getToken(), null, snap);
        return saved;
    }

    /**
     * Returns the PNG bytes of the QR code that encodes this token's
     * registration link. Generated exactly once and persisted on the token
     * row; later calls stream the stored bytes. {@code baseOverride} lets the
     * caller supply the front-end origin (so dev/staging encode the right
     * host); falls back to the configured app.public-base-url.
     */
    public byte[] qrPng(String token, String baseOverride) {
        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        if (t.getQrCode() != null && t.getQrCode().length > 0) {
            return t.getQrCode();
        }
        String base = StringUtils.hasText(baseOverride) ? baseOverride.trim()
                : (StringUtils.hasText(publicBaseUrl) ? publicBaseUrl.trim() : "");
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        String link = base + "/register?token=" + token;
        byte[] png = qrCodes.pngForText(link);
        t.setQrCode(png);
        tokens.save(t);
        return png;
    }

    private boolean isLive(AssessmentToken t) {
        if (t.getExpiresAt() != null && t.getExpiresAt().isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            return false;
        }
        return t.getMaxUses() == null || t.getUsedCount() < t.getMaxUses();
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s : null;
    }

    /**
     * Public lookup — the /register page calls this to find out which
     * Assessment + context the token represents. Does NOT consume; just
     * reads. Rejects tokens that are expired or already at maxUses.
     */
    @Transactional(readOnly = true)
    public AssessmentTokenDto resolve(String token) {
        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        if (t.getExpiresAt() != null && t.getExpiresAt().isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            throw new BadRequestException("Token expired");
        }
        if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses()) {
            throw new BadRequestException("Token has been used the maximum number of times");
        }
        // Enrich with display names so the anonymous /register page can show
        // the assessment + entity/group without calling auth-gated endpoints.
        AssessmentTokenDto dto = toDto(t);
        assessments.findById(t.getAssessmentId())
                .ifPresent(a -> dto.setAssessmentName(a.getName()));
        if (t.getEntityId() != null && !t.getEntityId().isEmpty()) {
            entities.findById(t.getEntityId()).ifPresent(e ->
                    dto.setEntityName(e.getCompanyName() != null && !e.getCompanyName().isEmpty()
                            ? e.getCompanyName() : e.getName()));
        }
        if (t.getGroupId() != null && !t.getGroupId().isEmpty()) {
            groups.findById(t.getGroupId()).ifPresent(g -> dto.setGroupName(g.getName()));
        }
        // For a login token, hand the public page the email to prefill and the
        // already-assigned session to open after a successful sign-in.
        if (StringUtils.hasText(t.getRespondentId())) {
            String em = respondents.findById(t.getRespondentId()).map(Respondent::getEmail).orElse(null);
            if (!StringUtils.hasText(em)) {
                em = users.findById(t.getRespondentId()).map(User::getEmail).orElse(null);
            }
            dto.setLoginEmail(em);
            final String aid = t.getAssessmentId();
            sessions.findByRespondentId(t.getRespondentId()).stream()
                    .filter(s -> aid.equals(s.getAssessmentId()))
                    .findFirst()
                    .ifPresent(s -> dto.setSessionId(s.getId()));
        }
        return dto;
    }

    /**
     * Increment usedCount after a successful registration. The /register
     * page calls this once the new respondent row is in place.
     */
    public AssessmentTokenDto consume(String token) {
        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        t.setUsedCount(t.getUsedCount() + 1);
        return toDto(tokens.save(t));
    }

    @Transactional(readOnly = true)
    public List<AssessmentTokenDto> listForAssessment(String assessmentId) {
        return tokens.findByAssessmentId(assessmentId).stream().map(this::toDto).collect(Collectors.toList());
    }

    public void revoke(String token) {
        if (tokens.existsById(token)) {
            tokens.deleteById(token);
            audit.record("TOKEN_REVOKED", "assessment_token", token, null, null);
        }
    }

    private String randomToken() {
        byte[] buf = new byte[32];
        RNG.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    private AssessmentTokenDto toDto(AssessmentToken t) {
        AssessmentTokenDto d = new AssessmentTokenDto();
        d.setToken(t.getToken());
        d.setAssessmentId(t.getAssessmentId());
        d.setEntityId(t.getEntityId());
        d.setGroupId(t.getGroupId());
        d.setRespondentId(t.getRespondentId());
        d.setEmail(t.getEmail());
        // A respondent-bound token is a sign-in link; everything else is a
        // registration-form link. resolve() enriches login tokens further.
        d.setKind(t.getRespondentId() != null ? "login" : "register");
        d.setMaxUses(t.getMaxUses());
        d.setUsedCount(t.getUsedCount());
        if (t.getExpiresAt() != null) d.setExpiresAt(t.getExpiresAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        if (t.getCreatedAt() != null) d.setCreatedAt(t.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        d.setCreatedBy(t.getCreatedBy());
        return d;
    }

    private String currentActorId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UserPrincipal)) return null;
        return ((UserPrincipal) auth.getPrincipal()).getId();
    }
}
