package com.bodhpsychometric.bodhassess.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.exception.ServiceException;
import com.bodhpsychometric.bodhassess.exception.UnauthorizedAccessException;
import com.bodhpsychometric.bodhassess.model.Respondent;
import com.bodhpsychometric.bodhassess.model.User;
import com.bodhpsychometric.bodhassess.model.UserMeta;
import com.bodhpsychometric.bodhassess.payload.BulkRespondentDtos;
import com.bodhpsychometric.bodhassess.payload.LoginRequest;
import com.bodhpsychometric.bodhassess.payload.RespondentDto;
import com.bodhpsychometric.bodhassess.payload.RespondentLoginResponse;
import com.bodhpsychometric.bodhassess.repository.RespondentRepository;
import com.bodhpsychometric.bodhassess.repository.UserMetaRepository;
import com.bodhpsychometric.bodhassess.repository.UserRepository;
import com.bodhpsychometric.bodhassess.security.TokenProvider;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

@Service
@Transactional
public class RespondentsService {

    private static final Logger log = LoggerFactory.getLogger(RespondentsService.class);

    private static final int MAX_BULK = 1000;
    private static final String BULK_LOCK_KEY = "bodhassess_respondents_id_gen";
    private static final int BULK_LOCK_TIMEOUT_SEC = 30;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern DOB_FMT = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    @Autowired
    private RespondentRepository repo;

    @Autowired
    private TokenProvider tokenProvider;

    @Autowired
    private UserRepository users;

    @Autowired
    private UserMetaRepository userMeta;

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public List<RespondentDto> list() {
        return repo.findAllOrderByCreatedAt().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public RespondentDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Respondent", "id", id)));
    }

    public RespondentDto create(RespondentDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getName()) || !StringUtils.hasText(dto.getEmail())) {
            throw new BadRequestException("id, name, and email are required");
        }
        Respondent r = repo.findById(dto.getId()).orElseGet(Respondent::new);
        r.setId(dto.getId());
        r.setName(dto.getName().trim());
        r.setEmail(dto.getEmail().trim());
        r.setPhone(dto.getPhone());
        r.setDob(dto.getDob());
        r.setConsent(StringUtils.hasText(dto.getConsent()) ? dto.getConsent() : "Pending");
        r.setSessionsCount(dto.getSessionsCount() != null ? dto.getSessionsCount() : 0);
        r.setLastAssessment(dto.getLastAssessment());
        r.setAccountType(StringUtils.hasText(dto.getAccountType()) ? dto.getAccountType() : "individual");
        r.setOrgName(dto.getOrgName());
        r.setOrgWebsite(dto.getOrgWebsite());
        Respondent saved = repo.save(r);
        syncIdentity(saved);
        return toDto(saved);
    }

    public RespondentDto update(String id, RespondentDto dto) {
        Respondent r = repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Respondent", "id", id));
        if (StringUtils.hasText(dto.getName())) r.setName(dto.getName());
        if (StringUtils.hasText(dto.getEmail())) r.setEmail(dto.getEmail());
        if (StringUtils.hasText(dto.getPhone())) r.setPhone(dto.getPhone());
        if (StringUtils.hasText(dto.getDob())) r.setDob(dto.getDob());
        if (StringUtils.hasText(dto.getConsent())) r.setConsent(dto.getConsent());
        if (dto.getSessionsCount() != null) r.setSessionsCount(dto.getSessionsCount());
        if (StringUtils.hasText(dto.getLastAssessment())) r.setLastAssessment(dto.getLastAssessment());
        if (StringUtils.hasText(dto.getAccountType())) r.setAccountType(dto.getAccountType());
        if (StringUtils.hasText(dto.getOrgName())) r.setOrgName(dto.getOrgName());
        if (StringUtils.hasText(dto.getOrgWebsite())) r.setOrgWebsite(dto.getOrgWebsite());
        Respondent saved = repo.save(r);
        syncIdentity(saved);
        return toDto(saved);
    }

    /**
     * Mirror a respondent into the unified {@code app_users} + {@code user_meta}
     * identity so the portal's /auth/login (which authenticates against
     * app_users) sees it immediately, instead of only after the boot-time
     * IdentityBootstrapRunner re-runs. Upsert keyed on the respondent id —
     * the id is reused as the user id so existing references
     * (portal_sessions.respondent_id, etc.) stay valid.
     */
    private void syncIdentity(Respondent r) {
        if (r == null || !StringUtils.hasText(r.getId())) return;
        // Unique-email guard: if this email already belongs to a DIFFERENT
        // user row, don't clobber it — log and skip. Mirrors the runner's
        // guard so the two paths behave the same.
        if (StringUtils.hasText(r.getEmail())) {
            User other = users.findByEmailIgnoreCase(r.getEmail().trim()).orElse(null);
            if (other != null && !other.getId().equals(r.getId())) {
                log.warn("[respondent-identity] skip sync for {} — email '{}' already a different user ({})",
                        r.getId(), r.getEmail(), other.getId());
                return;
            }
        }
        User u = users.findById(r.getId()).orElseGet(User::new);
        boolean isNew = u.getId() == null;
        u.setId(r.getId());
        if (StringUtils.hasText(r.getEmail())) u.setEmail(r.getEmail().trim());
        u.setDob(r.getDob());
        if (!StringUtils.hasText(u.getStatus())) u.setStatus("Active");
        if (isNew) u.setSuperAdmin(false);
        users.save(u);

        UserMeta m = userMeta.findById(r.getId()).orElseGet(UserMeta::new);
        m.setUserId(r.getId());
        m.setName(r.getName());
        m.setPhone(r.getPhone());
        m.setConsent(r.getConsent());
        m.setOrgName(r.getOrgName());
        m.setOrgWebsite(r.getOrgWebsite());
        userMeta.save(m);
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    public RespondentLoginResponse login(LoginRequest req) {
        String identifier = req.resolveIdentifier();
        String dob = req.getDob() == null ? "" : req.getDob().trim();
        if (identifier.isEmpty() || dob.isEmpty()) {
            throw new BadRequestException("identifier (email or phone) and dob required");
        }
        if (!DOB_FMT.matcher(dob).matches()) {
            throw new BadRequestException("dob must be YYYY-MM-DD");
        }

        Respondent r = null;
        if (EMAIL.matcher(identifier).matches()) {
            r = repo.findByEmailAndDob(identifier, dob).orElse(null);
        } else {
            String phoneDigits = identifier.replaceAll("\\D", "");
            if (!phoneDigits.isEmpty()) {
                for (Respondent cand : repo.findByDobWithPhone(dob)) {
                    String candDigits = cand.getPhone() == null ? "" : cand.getPhone().replaceAll("\\D", "");
                    if (!candDigits.isEmpty() && candDigits.equals(phoneDigits)) { r = cand; break; }
                }
            }
        }
        if (r == null) throw new UnauthorizedAccessException("invalid credentials");

        String token = tokenProvider.createToken(r.getId(), r.getEmail(),
                UserPrincipal.UserType.RESPONDENT, new ArrayList<>());
        return new RespondentLoginResponse(token, toDto(r));
    }

    public RespondentDto me(UserPrincipal principal) {
        if (principal == null) throw new UnauthorizedAccessException("token required");
        if (principal.getUserType() != UserPrincipal.UserType.RESPONDENT) {
            throw new UnauthorizedAccessException("not a respondent token");
        }
        Respondent r = repo.findById(principal.getId())
                .orElseThrow(() -> new UnauthorizedAccessException("respondent not found"));
        return toDto(r);
    }

    /**
     * Bulk create up to 1000 respondents with server-generated R-NNN ids.
     *
     * MySQL adaptation of the Go advisory-lock pattern: we acquire a named
     * lock with GET_LOCK (session-scoped, released at end of session/txn or
     * via RELEASE_LOCK) so concurrent uploads cannot collide on id
     * generation. INSERT IGNORE handles email-UNIQUE collisions silently;
     * we re-fetch the inserted row to know whether it actually persisted.
     */
    public BulkRespondentDtos.Response bulkCreate(BulkRespondentDtos.Request req) {
        if (req.getRespondents() == null || req.getRespondents().isEmpty()) {
            throw new BadRequestException("respondents array is empty");
        }
        if (req.getRespondents().size() > MAX_BULK) {
            throw new BadRequestException("max " + MAX_BULK + " respondents per upload");
        }

        BulkRespondentDtos.Response resp = new BulkRespondentDtos.Response();

        Object lockResult = em.createNativeQuery("SELECT GET_LOCK(?1, ?2)")
                .setParameter(1, BULK_LOCK_KEY)
                .setParameter(2, BULK_LOCK_TIMEOUT_SEC)
                .getSingleResult();
        if (lockResult == null || ((Number) lockResult).intValue() != 1) {
            throw new ServiceException("could not acquire bulk-insert lock");
        }

        try {
            Map<String, Integer> seen = new HashMap<>();
            int rowNum = 0;
            for (BulkRespondentDtos.Row row : req.getRespondents()) {
                rowNum++;
                String name = row.getName() == null ? "" : row.getName().trim();
                String email = row.getEmail() == null ? "" : row.getEmail().trim().toLowerCase();
                String dob = row.getDob() == null ? "" : row.getDob().trim();
                String consent = row.getConsent() == null ? "" : row.getConsent().trim();

                if (name.isEmpty()) {
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, null, "name is required"));
                    continue;
                }
                if (!EMAIL.matcher(email).matches()) {
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email, "invalid email"));
                    continue;
                }
                if (!DOB_FMT.matcher(dob).matches()) {
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email, "dob must be YYYY-MM-DD"));
                    continue;
                }
                try {
                    LocalDate d = LocalDate.parse(dob);
                    if (d.isAfter(LocalDate.now()) || d.getYear() < 1900) {
                        resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email, "dob is not a valid date"));
                        continue;
                    }
                } catch (Exception e) {
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email, "dob is not a valid date"));
                    continue;
                }
                if (consent.isEmpty()) consent = "Pending";
                if (!"Granted".equals(consent) && !"Pending".equals(consent) && !"Withdrawn".equals(consent)) {
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email, "consent must be Granted, Pending, or Withdrawn"));
                    continue;
                }
                Integer prev = seen.get(email);
                if (prev != null) {
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email,
                            "duplicate email in file (also row " + prev + ")"));
                    continue;
                }
                seen.put(email, rowNum);

                // Compute next R-NNN id while we hold the lock.
                String nextId = (String) em.createNativeQuery(
                    "SELECT CONCAT('R-', LPAD(COALESCE(MAX(CAST(SUBSTRING(id, 3) AS UNSIGNED)), 0) + 1, 3, '0'))" +
                    " FROM respondents WHERE id REGEXP '^R-[0-9]+$'")
                    .getSingleResult();

                int affected = em.createNativeQuery(
                    "INSERT IGNORE INTO respondents (id, name, email, dob, consent, sessions_count)" +
                    " VALUES (?1, ?2, ?3, ?4, ?5, 0)")
                    .setParameter(1, nextId)
                    .setParameter(2, name)
                    .setParameter(3, email)
                    .setParameter(4, dob)
                    .setParameter(5, consent)
                    .executeUpdate();

                if (affected == 0) {
                    // Email already exists in DB (UNIQUE conflict).
                    resp.setSkipped(resp.getSkipped() + 1);
                    resp.getErrors().add(new BulkRespondentDtos.Error(rowNum, email, "email already exists"));
                    continue;
                }

                // Mirror into the unified identity tables so the bulk-created
                // respondent can log in to the portal immediately (/auth/login
                // authenticates against app_users), not only after the next
                // IdentityBootstrapRunner pass. INSERT IGNORE leaves any
                // pre-existing user row for this email untouched.
                em.createNativeQuery(
                    "INSERT IGNORE INTO app_users (id, email, dob, status, is_super_admin)" +
                    " VALUES (?1, ?2, ?3, 'Active', 0)")
                    .setParameter(1, nextId)
                    .setParameter(2, email)
                    .setParameter(3, dob)
                    .executeUpdate();
                em.createNativeQuery(
                    "INSERT IGNORE INTO user_meta (user_id, name, consent)" +
                    " VALUES (?1, ?2, ?3)")
                    .setParameter(1, nextId)
                    .setParameter(2, name)
                    .setParameter(3, consent)
                    .executeUpdate();

                @SuppressWarnings("unchecked")
                List<Object[]> fetched = em.createNativeQuery(
                    "SELECT id, name, email, COALESCE(dob, ''), COALESCE(consent, 'Pending')," +
                    " COALESCE(sessions_count, 0), COALESCE(last_assessment, '')" +
                    " FROM respondents WHERE id = ?1")
                    .setParameter(1, nextId)
                    .getResultList();

                if (fetched.isEmpty()) continue;
                Object[] r = fetched.get(0);
                RespondentDto dto = new RespondentDto();
                dto.setId((String) r[0]);
                dto.setName((String) r[1]);
                dto.setEmail((String) r[2]);
                dto.setDob((String) r[3]);
                dto.setConsent((String) r[4]);
                dto.setSessionsCount(((Number) r[5]).intValue());
                dto.setLastAssessment((String) r[6]);
                resp.getInserted().add(dto);
                resp.setCreated(resp.getCreated() + 1);
            }
        } finally {
            try {
                em.createNativeQuery("SELECT RELEASE_LOCK(?1)")
                        .setParameter(1, BULK_LOCK_KEY)
                        .getSingleResult();
            } catch (Exception e) {
                log.warn("RELEASE_LOCK({}) failed during bulk respondent op: {}", BULK_LOCK_KEY, e.getMessage());
            }
        }
        return resp;
    }

    private RespondentDto toDto(Respondent r) {
        RespondentDto d = new RespondentDto();
        d.setId(r.getId());
        d.setName(r.getName());
        d.setEmail(r.getEmail());
        d.setPhone(r.getPhone());
        d.setDob(r.getDob());
        d.setConsent(r.getConsent());
        d.setSessionsCount(r.getSessionsCount());
        d.setLastAssessment(r.getLastAssessment());
        d.setAccountType(r.getAccountType());
        d.setOrgName(r.getOrgName());
        d.setOrgWebsite(r.getOrgWebsite());
        return d;
    }
}
