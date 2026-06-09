package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.DuplicateResourceException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.exception.UnauthorizedAccessException;
import com.bodhpsychometric.bodhassess.model.Assessment;
import com.bodhpsychometric.bodhassess.model.AssessmentToken;
import com.bodhpsychometric.bodhassess.model.EntityRegistration;
import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.model.Respondent;
import com.bodhpsychometric.bodhassess.model.RespondentGroup;
import com.bodhpsychometric.bodhassess.payload.PublicRegistrationDto;
import com.bodhpsychometric.bodhassess.repository.AssessmentRepository;
import com.bodhpsychometric.bodhassess.repository.AssessmentTokenRepository;
import com.bodhpsychometric.bodhassess.repository.EntityRegistrationRepository;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentGroupRepository;
import com.bodhpsychometric.bodhassess.repository.RespondentRepository;

/**
 * Single-call public registration. The /register page hits one endpoint
 * with the opaque token + the registrant's details, and the service:
 *
 *   1. Resolves and validates the token (expiry + maxUses)
 *   2. Reuses or creates a Respondent (pre-bound on the token wins)
 *   3. If the token carries an entityId, appends the respondent to the
 *      entity's member set (if not already present)
 *   4. Enforces the per-(entity, assessment) cap before creating the session
 *   5. Creates the PortalSession that the take-assessment flow renders
 *   6. Increments token.usedCount
 *
 * All steps happen in one @Transactional unit so a failure at any point
 * rolls back the partial state.
 */
@Service
@Transactional
public class PublicRegistrationService {

    @Autowired private AssessmentTokenRepository tokens;
    @Autowired private AssessmentRepository assessments;
    @Autowired private RespondentRepository respondents;
    @Autowired private EntityRegistrationRepository entities;
    @Autowired private RespondentGroupRepository groups;
    @Autowired private PortalSessionRepository sessions;
    @Autowired private AssessmentService assessmentService;
    @Autowired private com.bodhpsychometric.bodhassess.repository.UserRepository users;
    @Autowired private com.bodhpsychometric.bodhassess.repository.UserMetaRepository userMeta;
    @Autowired private com.bodhpsychometric.bodhassess.security.TokenProvider tokenProvider;

    public PublicRegistrationDto.Result register(String token, PublicRegistrationDto req) {
        if (req == null
                || !StringUtils.hasText(req.getName())
                || !StringUtils.hasText(req.getEmail())
                || !StringUtils.hasText(req.getDob())) {
            throw new BadRequestException("name, email, and dob are required");
        }

        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        if (t.getExpiresAt() != null && t.getExpiresAt().isBefore(OffsetDateTime.now(java.time.ZoneOffset.UTC))) {
            throw new BadRequestException("Token expired");
        }
        if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses()) {
            throw new BadRequestException("Token has been used the maximum number of times");
        }

        Assessment a = assessments.findById(t.getAssessmentId())
                .orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", t.getAssessmentId()));

        // 1. Respondent — pre-bound on the token wins (admin-targeted resend).
        //    Otherwise this is an open registration: a returning person must
        //    log in rather than create a second account, so we reject when a
        //    duplicate matches by (email OR phone OR companyId) AND dob.
        String respondentId = t.getRespondentId();
        if (!StringUtils.hasText(respondentId)) {
            if (isExistingRegistrant(req)) {
                throw new DuplicateResourceException(
                        "An account with these details already exists. Please log in to continue.");
            }
            Respondent r = new Respondent();
            r.setId("R-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            r.setName(req.getName().trim());
            r.setEmail(req.getEmail().trim());
            r.setPhone(blankToNull(req.getPhone()));
            r.setDob(req.getDob().trim());
            r.setCompanyId(blankToNull(req.getCompanyId()));
            r.setConsent("Pending");
            r.setAccountType("individual");
            r.setSessionsCount(0);
            r = respondents.save(r);
            respondentId = r.getId();
        }

        // 2. If the token has an entity, link the respondent into that
        //    entity's member set (idempotent).
        String entityName = null;
        if (StringUtils.hasText(t.getEntityId())) {
            EntityRegistration e = entities.findById(t.getEntityId())
                    .orElseThrow(() -> new ResourceNotFoundException("Entity", "id", t.getEntityId()));
            entityName = e.getCompanyName() != null && !e.getCompanyName().isEmpty()
                    ? e.getCompanyName() : e.getName();
            if (e.getMemberIds() == null) e.setMemberIds(new HashSet<>());
            if (!e.getMemberIds().contains(respondentId)) {
                e.getMemberIds().add(respondentId);
                entities.save(e);
            }
            // 3. Enforce the per-(entity, assessment) cap before creating
            //    a session — better here than after the row is inserted.
            if (assessmentService.wouldExceedEntityCap(a.getId(), t.getEntityId(), 1)) {
                throw new BadRequestException(
                        "This assessment's cap for the entity has been reached. Please contact the administrator.");
            }
        }

        // 2b. If the token has a group, link the respondent into that
        //     group's member set as well (idempotent).
        if (StringUtils.hasText(t.getGroupId())) {
            RespondentGroup g = groups.findById(t.getGroupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Group", "id", t.getGroupId()));
            if (g.getMemberIds() == null) g.setMemberIds(new HashSet<>());
            if (!g.getMemberIds().contains(respondentId)) {
                g.getMemberIds().add(respondentId);
                groups.save(g);
            }
        }

        // 3b. Mirror the respondent into the unified identity table so the
        //     person can sign in through /auth/login. app_users keyed by the
        //     same id keeps portal_sessions/entity_members references valid.
        //     Idempotent: create-if-absent, and just add the entity link on
        //     return visits.
        upsertUser(respondentId, req, t.getEntityId());

        // 4. Create the session. Status "Active" + minimal fields — the
        //    take-assessment flow fills the rest.
        PortalSession s = new PortalSession();
        s.setId("SESS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        s.setAssessmentId(a.getId());
        s.setName(a.getName());
        s.setRespondentId(respondentId);
        s.setRespondentName(req.getName().trim());
        s.setRespondentEmail(req.getEmail().trim());
        s.setInstrument(a.getQuestionnaireName());
        s.setInstrumentFullName(a.getQuestionnaireName());
        s.setVertical(a.getVertical());
        s.setLanguage(a.getLanguage() != null ? a.getLanguage() : "English");
        s.setStatus("Active");
        s.setScore("--");
        if (StringUtils.hasText(t.getEntityId())) {
            s.setEntityId(t.getEntityId());
            s.setEntityName(entityName);
        }
        PortalSession savedSession = sessions.save(s);

        // 5. Consume the token (++usedCount). We persist with the
        //    pre-incremented value so retries surface the cap immediately.
        t.setUsedCount(t.getUsedCount() + 1);
        tokens.save(t);

        // 6. Mint a RESPONDENT auth token for the new session so the SPA can
        //    open /portal/take directly — the registrant is already "logged in"
        //    to the portal and never bounces through /portal/login.
        String authToken = tokenProvider.createToken(
                respondentId, req.getEmail().trim(),
                com.bodhpsychometric.bodhassess.security.UserPrincipal.UserType.RESPONDENT,
                new java.util.ArrayList<>());

        return new PublicRegistrationDto.Result(savedSession.getId(), respondentId, a.getId(), authToken);
    }

    /**
     * Existing-account path for a register-kind link (entity / group /
     * standalone). When the person filling the form already has an account, we
     * don't register them again — they confirm their email + dob (the portal
     * credential), and we: verify it, link them into the token's entity/group,
     * ensure they have a session for the assessment, count the token use, and
     * mint a RESPONDENT auth token. The SPA then opens that session directly,
     * so a registered entity member lands IN the assessment instead of the
     * dashboard.
     */
    public PublicRegistrationDto.Result loginExisting(String token, PublicRegistrationDto req) {
        if (req == null || !StringUtils.hasText(req.getEmail()) || !StringUtils.hasText(req.getDob())) {
            throw new BadRequestException("email and dob are required");
        }
        AssessmentToken t = tokens.findById(token)
                .orElseThrow(() -> new ResourceNotFoundException("AssessmentToken", "token", token));
        if (t.getExpiresAt() != null && t.getExpiresAt().isBefore(OffsetDateTime.now(java.time.ZoneOffset.UTC))) {
            throw new BadRequestException("Token expired");
        }
        if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses()) {
            throw new BadRequestException("Token has been used the maximum number of times");
        }
        Assessment a = assessments.findById(t.getAssessmentId())
                .orElseThrow(() -> new ResourceNotFoundException("Assessment", "id", t.getAssessmentId()));

        // Verify the existing account — email + dob is the portal password.
        String email = req.getEmail().trim();
        String dob = req.getDob().trim();
        com.bodhpsychometric.bodhassess.model.User u = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new UnauthorizedAccessException("Email or date of birth doesn't match our records."));
        if (!dob.equals(u.getDob() == null ? null : u.getDob().trim())) {
            throw new UnauthorizedAccessException("Email or date of birth doesn't match our records.");
        }
        if (u.getStatus() != null && !"Active".equalsIgnoreCase(u.getStatus())) {
            throw new UnauthorizedAccessException("This account is not active.");
        }
        String respondentId = u.getId();

        // Link into the token's entity/group (idempotent), mirroring register().
        String entityName = null;
        if (StringUtils.hasText(t.getEntityId())) {
            EntityRegistration e = entities.findById(t.getEntityId())
                    .orElseThrow(() -> new ResourceNotFoundException("Entity", "id", t.getEntityId()));
            entityName = StringUtils.hasText(e.getCompanyName()) ? e.getCompanyName() : e.getName();
            if (e.getMemberIds() == null) e.setMemberIds(new HashSet<>());
            if (!e.getMemberIds().contains(respondentId)) { e.getMemberIds().add(respondentId); entities.save(e); }
        }
        if (StringUtils.hasText(t.getGroupId())) {
            RespondentGroup g = groups.findById(t.getGroupId())
                    .orElseThrow(() -> new ResourceNotFoundException("Group", "id", t.getGroupId()));
            if (g.getMemberIds() == null) g.setMemberIds(new HashSet<>());
            if (!g.getMemberIds().contains(respondentId)) { g.getMemberIds().add(respondentId); groups.save(g); }
        }
        upsertUser(respondentId, req, t.getEntityId());

        // Ensure exactly one session for (assessment, respondent) — reuse if any.
        PortalSession session = sessions.findByRespondentId(respondentId).stream()
                .filter(s -> a.getId().equals(s.getAssessmentId()))
                .findFirst().orElse(null);
        if (session == null) {
            if (StringUtils.hasText(t.getEntityId())
                    && assessmentService.wouldExceedEntityCap(a.getId(), t.getEntityId(), 1)) {
                throw new BadRequestException(
                        "This assessment's cap for the entity has been reached. Please contact the administrator.");
            }
            Respondent r = respondents.findById(respondentId).orElse(null);
            PortalSession s = new PortalSession();
            s.setId("SESS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            s.setAssessmentId(a.getId());
            s.setName(a.getName());
            s.setRespondentId(respondentId);
            s.setRespondentName(r != null ? r.getName() : null);
            s.setRespondentEmail(email);
            s.setInstrument(a.getQuestionnaireName());
            s.setInstrumentFullName(a.getQuestionnaireName());
            s.setVertical(a.getVertical());
            s.setLanguage(a.getLanguage() != null ? a.getLanguage() : "English");
            s.setStatus("Active");
            s.setScore("--");
            if (StringUtils.hasText(t.getEntityId())) { s.setEntityId(t.getEntityId()); s.setEntityName(entityName); }
            session = sessions.save(s);
        }

        // Count the use, like register() does.
        t.setUsedCount(t.getUsedCount() + 1);
        tokens.save(t);

        String authToken = tokenProvider.createToken(
                respondentId, email,
                com.bodhpsychometric.bodhassess.security.UserPrincipal.UserType.RESPONDENT,
                new java.util.ArrayList<>());
        return new PublicRegistrationDto.Result(session.getId(), respondentId, a.getId(), authToken);
    }

    /**
     * Create-if-absent mirror of the registrant in the unified identity
     * tables ({@code app_users} + {@code user_meta}), keyed by the respondent
     * id. On a return visit (user already exists) we only ensure the entity
     * membership link. Never throws on a pre-existing row.
     */
    private void upsertUser(String userId, PublicRegistrationDto req, String entityId) {
        com.bodhpsychometric.bodhassess.model.User u = users.findById(userId).orElse(null);
        if (u == null) {
            // Guard the unique email: if another user already owns it, leave
            // the existing identity alone rather than fail the registration.
            String email = req.getEmail() == null ? null : req.getEmail().trim();
            if (email != null && users.findByEmailIgnoreCase(email).isPresent()) {
                return;
            }
            u = new com.bodhpsychometric.bodhassess.model.User();
            u.setId(userId);
            u.setEmail(email);
            u.setDob(req.getDob() == null ? null : req.getDob().trim());
            u.setStatus("Active");
            u.setSuperAdmin(false);

            com.bodhpsychometric.bodhassess.model.UserMeta m =
                    new com.bodhpsychometric.bodhassess.model.UserMeta();
            m.setUserId(userId);
            m.setName(req.getName() == null ? null : req.getName().trim());
            m.setPhone(blankToNull(req.getPhone()));
            m.setConsent("Pending");
            m.setCompanyId(blankToNull(req.getCompanyId()));
            userMeta.save(m);
        }
        if (StringUtils.hasText(entityId)) {
            if (u.getEntityIds() == null) u.setEntityIds(new HashSet<>());
            u.getEntityIds().add(entityId);
        }
        users.save(u);
    }

    /**
     * Pre-registration check used by the public page to decide whether to
     * prompt "log in" instead of letting the person register again. Requires
     * a dob plus at least one of email / phone / company id to be meaningful.
     */
    @Transactional(readOnly = true)
    public PublicRegistrationDto.CheckResult checkExisting(PublicRegistrationDto req) {
        return new PublicRegistrationDto.CheckResult(isExistingRegistrant(req));
    }

    private boolean isExistingRegistrant(PublicRegistrationDto req) {
        if (req == null || !StringUtils.hasText(req.getDob())) return false;
        String email = blankToNull(req.getEmail());
        String phone = blankToNull(req.getPhone());
        String companyId = blankToNull(req.getCompanyId());
        if (email == null && phone == null && companyId == null) return false;
        return !respondents.findDuplicates(email, phone, companyId, req.getDob().trim()).isEmpty();
    }

    private static String blankToNull(String s) {
        return StringUtils.hasText(s) ? s.trim() : null;
    }
}
