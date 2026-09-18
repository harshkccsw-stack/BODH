package com.bodhpsychometric.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.MemoryMeshAuthVerifyRequest;
import com.bodhpsychometric.dto.MemoryMeshAuthVerifyResponse;
import com.bodhpsychometric.dto.MemoryMeshRespondentSyncRequest;
import com.bodhpsychometric.dto.MemoryMeshRespondentSyncResponse;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Mirrors a respondent that MemoryMesh created into this database, as an
 * identity plus a respondent profile — the same two rows every other creation
 * point writes.
 *
 * <p>The rules are {@link PortalRegistrationService}'s, on purpose: this is a
 * public-form-shaped write arriving from another system rather than from a
 * browser, and it deserves exactly the same trust. So:
 * <ul>
 *   <li>Unknown email → a new identity, serial code derived from the id, and a
 *       profile. Consent stays false; the take flow's terms step records it.</li>
 *   <li>Known email with a MATCHING dob → the same person. A missing profile is
 *       attached; an existing one has its blanks filled and is otherwise left
 *       alone. An admin's value on file always beats the mirror's.</li>
 *   <li>Known email with a different dob → 409. dob is the credential, and a
 *       mismatch means the mirror is not entitled to that account.</li>
 * </ul>
 *
 * <p>Idempotent by construction: MemoryMesh may retry, and a second call for
 * the same person writes nothing new and answers {@code created:false}.
 */
@Service
public class MemoryMeshSyncService {

    private final UserRepository users;
    private final RespondentUserRepository respondents;
    private final PractitionerUserRepository practitioners;

    @PersistenceContext
    private EntityManager entityManager;

    public MemoryMeshSyncService(UserRepository users, RespondentUserRepository respondents,
            PractitionerUserRepository practitioners) {
        this.users = users;
        this.respondents = respondents;
        this.practitioners = practitioners;
    }

    @Transactional
    public MemoryMeshRespondentSyncResponse sync(MemoryMeshRespondentSyncRequest request) {
        String email = request.email().trim();
        User user = users.findByEmailIgnoreCase(email).orElse(null);
        if (user == null) {
            return MemoryMeshRespondentSyncResponse.from(createIdentity(email, request), true);
        }

        if (user.getDob() == null || !user.getDob().equals(request.dob())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An account with this email already exists and its date of birth does not match");
        }
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }

        RespondentUser respondent = respondents.findByUserIdForPortal(user.getId()).orElse(null);
        if (respondent == null) {
            // A known identity with no respondent profile — a practitioner,
            // say. One person, one account: attach the profile to it.
            RespondentUser created = new RespondentUser();
            created.setUser(user);
            fillProfile(created, request);
            return MemoryMeshRespondentSyncResponse.from(respondents.save(created), true);
        }

        // Fill blanks, never overwrite — PortalRegistrationService.claimIdentity's
        // rule, for the same reason: what is on file may be an admin's.
        if (respondent.getGender() == null) {
            respondent.setGender(request.gender());
        }
        if (respondent.getPhone() == null) {
            respondent.setPhoneCountryCode(request.phoneCountryCode().trim());
            respondent.setPhone(request.phone().trim());
        }
        if (respondent.getName() == null || respondent.getName().isBlank()) {
            respondent.setName(request.name().trim());
        }
        return MemoryMeshRespondentSyncResponse.from(respondent, false);
    }

    /**
     * MemoryMesh's sign-in, verified against THIS side's accounts: a person who
     * only ever registered on BodhAssess can sign in to MemoryMesh, which then
     * creates its own copy from the profile returned here.
     *
     * <p>The same checks as {@link PortalAuthService#login}, plus the phone
     * pair MemoryMesh signs in with, and the same one message for every
     * failure. Stamps lastLoginAt: it IS a login, just not on this portal.
     */
    @Transactional
    public MemoryMeshAuthVerifyResponse verify(MemoryMeshAuthVerifyRequest request) {
        LocalDate dob = request.dob();
        RespondentUser respondent;
        if (request.hasPhonePair()) {
            List<RespondentUser> matches = respondents
                    .findByPhonePairForPortal(request.phoneCountryCode().trim(), request.phone().trim())
                    .stream().filter(r -> dob.equals(r.getUser().getDob())).toList();
            if (matches.size() != 1) {
                throw invalidCredentials();
            }
            respondent = matches.get(0);
        } else if (!request.hasIdentifier()) {
            throw invalidCredentials();
        } else if (request.identifier().contains("@")) {
            User user = users.findByEmailIgnoreCase(request.identifier().trim())
                    .orElseThrow(MemoryMeshSyncService::invalidCredentials);
            if (user.getDob() == null || !user.getDob().equals(dob)) {
                throw invalidCredentials();
            }
            respondent = respondents.findByUserIdForPortal(user.getId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                            "This account cannot take assessments"));
        } else {
            List<RespondentUser> matches = respondents.findByEmployeeIdForPortal(request.identifier().trim())
                    .stream().filter(r -> dob.equals(r.getUser().getDob())).toList();
            if (matches.size() != 1) {
                throw invalidCredentials();
            }
            respondent = matches.get(0);
        }
        User user = respondent.getUser();
        if (!user.isAccountStatus()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account is disabled");
        }
        user.setLastLoginAt(OffsetDateTime.now());
        return MemoryMeshAuthVerifyResponse.from(respondent);
    }

    private static ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
    }

    /**
     * Erase a respondent here, by email, because MemoryMesh's admin erased
     * them there.
     *
     * <p>Unlike {@code RespondentController.delete} this does NOT refuse over
     * held attempts: the whole point is that the person asked to be forgotten,
     * and refusing would leave their answers here after they were removed on
     * the other side. Rows go child-first — nothing in this chain is
     * cascade-mapped.
     *
     * <p>Answers to {@code false} when nobody holds that email, which is a
     * fine outcome for a delete and not an error.
     */
    @Transactional
    public boolean deleteByEmail(String email) {
        User user = users.findByEmailIgnoreCase(email == null ? "" : email.trim()).orElse(null);
        if (user == null) {
            return false;
        }
        RespondentUser respondent = respondents.findByUserIdForPortal(user.getId()).orElse(null);
        if (respondent == null) {
            return false;
        }
        Long id = respondent.getId();
        for (String table : new String[] { "assessment_answer", "demographic_response", "baseline_answer",
                "respondent_assessment_mapping" }) {
            // Native: several of these have no repository here, and one
            // (baseline_answer) outlives the entity that was removed with the
            // MemoryMesh feature it belonged to.
            entityManager.createNativeQuery("delete from " + table + " where respondent_user_id = :id")
                    .setParameter("id", id)
                    .executeUpdate();
        }
        respondents.delete(respondent);
        respondents.flush();
        // The credential row is shared with any practitioner profile.
        if (!user.isSuperAdmin() && user.getRoleGroup() == null
                && !practitioners.existsByUser_Id(user.getId())) {
            users.delete(user);
        }
        return true;
    }

    private RespondentUser createIdentity(String email, MemoryMeshRespondentSyncRequest request) {
        User user = new User();
        user.setEmail(email);
        user.setDob(request.dob());
        user.setAccountStatus(true);
        user = users.save(user);
        // Derived from the generated id, so it can only be set after the
        // insert — the same rule as RespondentController and the seeder.
        user.setSerialId(String.format("USR-%06d", user.getId()));

        RespondentUser respondent = new RespondentUser();
        respondent.setUser(user);
        fillProfile(respondent, request);
        return respondents.save(respondent);
    }

    private static void fillProfile(RespondentUser respondent, MemoryMeshRespondentSyncRequest request) {
        respondent.setName(request.name().trim());
        respondent.setPhoneCountryCode(request.phoneCountryCode().trim());
        respondent.setPhone(request.phone().trim());
        respondent.setGender(request.gender());
        // No organization, no employee code, no consent: see the request record.
    }
}
