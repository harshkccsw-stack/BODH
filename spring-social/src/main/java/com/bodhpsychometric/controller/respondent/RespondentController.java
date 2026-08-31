package com.bodhpsychometric.controller.respondent;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

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

import com.bodhpsychometric.dto.BulkRespondentRequest;
import com.bodhpsychometric.dto.BulkRespondentValidationResponse;
import com.bodhpsychometric.dto.RespondentRequest;
import com.bodhpsychometric.dto.RespondentResponse;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.auth.enums.Gender;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.UserRepository;
import com.bodhpsychometric.repository.organization.OrganizationRepository;

import com.bodhpsychometric.dto.validation.BirthDateValidator;
import com.bodhpsychometric.dto.validation.PhoneRules;

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

    /**
     * dd-MM-uuuu, and STRICT: the default (SMART) resolver quietly accepts
     * 31-02-2000 and hands back 29-02. On a bulk import that stores a birth
     * date nobody typed, and dob is the portal password — a silently corrected
     * date locks someone out of their own account.
     *
     * `uuuu`, not `yyyy`. STRICT treats yyyy as year-OF-ERA, which needs an
     * era field the pattern never supplies, so every parse would fail. uuuu is
     * the proleptic year and is what STRICT actually wants.
     */
    private static final DateTimeFormatter DOB_FORMAT =
            DateTimeFormatter.ofPattern("dd-MM-uuuu").withResolverStyle(ResolverStyle.STRICT);

    /** Same shape both frontends check, kept deliberately permissive. */
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private static final Pattern ALPHANUMERIC_PATTERN = Pattern.compile("^[A-Za-z0-9]+$");

    /**
     * The same rules the bean-validated forms use, compiled from the SAME
     * constants rather than re-typed: a sheet row must produce a numbered issue
     * rather than a 400 for the whole upload, so it cannot go through bean
     * validation at all, but it must not be allowed to drift from the forms
     * either. {@link PhoneRules} is where both get the text.
     */
    private static final Pattern COUNTRY_CODE_PATTERN =
            Pattern.compile(PhoneRules.COUNTRY_CODE_REGEX);

    private static final Pattern PHONE_PATTERN =
            Pattern.compile(PhoneRules.NATIONAL_NUMBER_REGEX);

    /** For the "not one of …" message, so it can never drift from the enum. */
    private static final String GENDER_VALUES = java.util.Arrays.stream(Gender.values())
            .map(Enum::name)
            .collect(java.util.stream.Collectors.joining(", "));

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
        ResponseEntity<Map<String, String>> conflict =
                employeeIdConflict(request.employeeId(), request.organizationId(), null);
        if (conflict != null) {
            return conflict;
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
        ResponseEntity<Map<String, String>> conflict =
                employeeIdConflict(request.employeeId(), request.organizationId(), respondent.getId());
        if (conflict != null) {
            return conflict;
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

    // ── Bulk upload (organization wizard, step 3 → "Upload") ──────────────

    /**
     * Dry run: check an uploaded sheet and report EVERY problem, writing
     * nothing. The page shows the whole report so the admin fixes the sheet
     * once instead of discovering one bad row per round trip.
     */
    @PostMapping("/bulk-validate")
    @Transactional(readOnly = true)
    public ResponseEntity<?> bulkValidateRespondents(@Valid @RequestBody BulkRespondentRequest request) {
        Organization organization = resolveOrganization(request.organizationId());
        if (organization == null) {
            return unknownOrganization();
        }
        return ResponseEntity.ok(validate(request, organization));
    }

    /**
     * Commit the sheet — all-or-nothing.
     *
     * It re-runs the identical checks rather than trusting the validate call:
     * the two are separate requests, so someone may have taken an email in
     * between, and nothing stops a client calling this one directly. On any
     * problem it returns the same report shape validate does, so the page has
     * one thing to render.
     *
     * All-or-nothing matters more here than for questions. A half-applied
     * sheet cannot simply be re-uploaded — every already-created row would
     * collide on uqUserEmail — so the admin would have to hand-edit the file
     * to remove the ones that landed. Writing nothing keeps re-upload correct.
     */
    @PostMapping("/bulk-create")
    public ResponseEntity<?> bulkCreateRespondents(@Valid @RequestBody BulkRespondentRequest request) {
        Organization organization = resolveOrganization(request.organizationId());
        if (organization == null) {
            return unknownOrganization();
        }

        // Pass 1 — validate everything before a single row is written.
        BulkRespondentValidationResponse report = validate(request, organization);
        if (!report.issues().isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(report);
        }

        // Pass 2 — write. Every row is a new identity: an email that already
        // exists was rejected above, so there is no attach-to-existing branch
        // here the way the single create has.
        //
        // The full RespondentResponse goes back rather than a slim ref: it
        // already carries serialId, email and dob, which is exactly what the
        // page needs to offer a credentials download. dob is the portal
        // password, but it is the admin's own uploaded value coming straight
        // back to them, not a disclosure of anything they did not just send.
        List<RespondentResponse> created = new ArrayList<>();
        for (BulkRespondentRequest.Row row : request.rows()) {
            User user = new User();
            user.setEmail(row.email().trim());
            user.setDob(parseDob(row.dob()));
            user.setAccountStatus(true);
            user = userRepository.save(user);
            // Derived from the generated id, so it can only be set after the
            // insert — same rule as the single create and the seeder.
            user.setSerialId(String.format("USR-%06d", user.getId()));

            RespondentUser respondent = new RespondentUser();
            respondent.setUser(user);
            respondent.setName(row.name().trim());
            respondent.setPhoneCountryCode(blankToNull(row.phoneCountryCode()));
            respondent.setPhone(blankToNull(row.phone()));
            respondent.setEmployeeId(normalizeEmployeeId(row.employeeId()));
            respondent.setGender(parseGender(row.gender()));
            respondent.setOrganization(organization);
            // Consent is NOT granted here. An admin uploading a spreadsheet
            // cannot consent on someone's behalf; the take flow's terms step
            // is what records it.
            created.add(RespondentResponse.from(respondentUserRepository.save(respondent)));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    /**
     * The single source of truth for what makes a sheet acceptable — shared by
     * validate and create so the two can never disagree.
     *
     * Collects problems instead of returning on the first, and checks each row
     * against three things: itself, the rest of the sheet, and the database.
     * Only the last two need the server at all, which is why this endpoint
     * exists rather than leaving it to the browser.
     */
    private BulkRespondentValidationResponse validate(BulkRespondentRequest request,
            Organization organization) {
        List<BulkRespondentValidationResponse.Issue> issues = new ArrayList<>();
        // Lower-cased email / upper-cased code → the FIRST row that used it,
        // so a duplicate can name its twin.
        Map<String, Integer> seenEmails = new HashMap<>();
        Map<String, Integer> seenEmployeeIds = new HashMap<>();
        int valid = 0;

        for (BulkRespondentRequest.Row row : request.rows()) {
            int before = issues.size();
            int line = row.row();

            String name = row.name() == null ? "" : row.name().trim();
            if (name.isEmpty()) {
                issues.add(issue(line, "name", "Name is required"));
            }

            String email = row.email() == null ? "" : row.email().trim();
            if (email.isEmpty()) {
                issues.add(issue(line, "email", "Email is required"));
            } else if (!EMAIL_PATTERN.matcher(email).matches()) {
                issues.add(issue(line, "email", "\"" + email + "\" is not a valid email address"));
            } else {
                String key = email.toLowerCase(Locale.ROOT);
                Integer first = seenEmails.putIfAbsent(key, line);
                if (first != null) {
                    issues.add(issue(line, "email",
                            "Duplicate email — row " + first + " already uses it"));
                } else if (userRepository.findByEmailIgnoreCase(email).isPresent()) {
                    // Decision: an existing email is an error to fix, never a
                    // silent attach. The single-create endpoint DOES attach a
                    // respondent profile to a matching identity, but doing that
                    // invisibly to a row buried in a 300-line sheet is not
                    // something an admin can be expected to notice.
                    issues.add(issue(line, "email", "Email already exists"));
                }
            }

            if (row.dob() == null || row.dob().isBlank()) {
                issues.add(issue(line, "dob", "Date of birth is required"));
            } else {
                LocalDate parsedDob = parseDob(row.dob());
                if (parsedDob == null) {
                    issues.add(issue(line, "dob",
                            "\"" + row.dob().trim() + "\" is not a real date in DD-MM-YYYY"));
                } else if (!BirthDateValidator.isInRange(parsedDob)) {
                    // The same bound both request DTOs carry, reached through
                    // the validator's static check so the sheet cannot end up
                    // accepting a birth date the forms reject.
                    issues.add(issue(line, "dob",
                            "\"" + row.dob().trim() + "\" must be between 01-01-1900 and today"));
                }
            }

            String employeeId = normalizeEmployeeId(row.employeeId());
            if (employeeId != null) {
                if (!ALPHANUMERIC_PATTERN.matcher(employeeId).matches()) {
                    issues.add(issue(line, "employeeId",
                            "Employee ID must contain only letters and numbers"));
                } else if (employeeId.length() > 32) {
                    issues.add(issue(line, "employeeId",
                            "Employee ID must be at most 32 characters"));
                } else {
                    Integer first = seenEmployeeIds.putIfAbsent(employeeId, line);
                    if (first != null) {
                        issues.add(issue(line, "employeeId",
                                "Duplicate Employee ID — row " + first + " already uses it"));
                    } else if (respondentUserRepository.countByEmployeeIdInOrganization(
                            employeeId, organization.getOrganizationId(), null) > 0) {
                        issues.add(issue(line, "employeeId",
                                "This Employee ID is already in use in this organization"));
                    }
                }
            }

            // Phone and gender are required in a sheet for the same reason they
            // are required on both forms: a respondent record should carry the
            // same minimum however it was created. Reported per row rather than
            // rejecting the upload, so one pass names every cell to fix.
            String countryCode = row.phoneCountryCode() == null ? "" : row.phoneCountryCode().trim();
            if (countryCode.isEmpty()) {
                issues.add(issue(line, "phoneCountryCode", "Country code is required"));
            } else if (!COUNTRY_CODE_PATTERN.matcher(countryCode).matches()) {
                issues.add(issue(line, "phoneCountryCode",
                        "\"" + countryCode + "\" is not a country code — write it as +91"));
            }

            String phone = row.phone() == null ? "" : row.phone().trim();
            if (phone.isEmpty()) {
                issues.add(issue(line, "phone", "Phone number is required"));
            } else if (!PHONE_PATTERN.matcher(phone).matches()) {
                issues.add(issue(line, "phone",
                        "\"" + phone + "\" — " + PhoneRules.NATIONAL_NUMBER_MESSAGE));
            } else if (!PhoneRules.withinE164(countryCode, phone)) {
                // The one rule neither cell can fail on its own. Reported only
                // once both halves are individually well-formed, so a single
                // mistyped number does not produce three issues for one cell.
                issues.add(issue(line, "phone", PhoneRules.E164_MESSAGE));
            }

            if (row.gender() == null || row.gender().isBlank()) {
                issues.add(issue(line, "gender", "Gender is required"));
            } else if (parseGender(row.gender()) == null) {
                issues.add(issue(line, "gender",
                        "\"" + row.gender().trim() + "\" is not one of " + GENDER_VALUES));
            }

            if (issues.size() == before) {
                valid++;
            }
        }
        return new BulkRespondentValidationResponse(request.rows().size(), valid, issues);
    }

    private static BulkRespondentValidationResponse.Issue issue(int row, String field, String message) {
        return new BulkRespondentValidationResponse.Issue(row, field, message);
    }

    /** Null when unparseable — the caller turns that into a row-level issue. */
    private static LocalDate parseDob(String dob) {
        if (dob == null || dob.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(dob.trim(), DOB_FORMAT);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /**
     * Null for blank OR unrecognised — both are row-level issues now that
     * gender is required.
     *
     * <p>Spaces and hyphens fold to underscores before the lookup, so the
     * spelling a person actually types in a spreadsheet cell ("Prefer not to
     * say") resolves to PREFER_NOT_TO_SAY. Nobody writing a sheet by hand
     * types the constant.
     */
    private static Gender parseGender(String gender) {
        if (gender == null || gender.isBlank()) {
            return null;
        }
        String normalized = gender.trim().toUpperCase(Locale.ROOT).replaceAll("[\\s-]+", "_");
        try {
            return Gender.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Consent transitions own consentedAt: first grant stamps it, revoke clears it. */
    private void apply(RespondentUser respondent, RespondentRequest request, Organization organization) {
        respondent.setName(request.name().trim());
        // The pair is written together and only together — a code with no
        // number, or ten digits with no country, is not a phone number anyone
        // can act on. Validation already required both, so this is only
        // guarding the shape the entity ends up in.
        respondent.setPhoneCountryCode(blankToNull(request.phoneCountryCode()));
        respondent.setPhone(blankToNull(request.phone()));
        respondent.setEmployeeId(normalizeEmployeeId(request.employeeId()));
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

    /**
     * Optional field: blank and null are the same thing — no code on file.
     * Stored UPPER-cased so the code is always capital letters on file; the
     * per-org uniqueness and portal login already match case-insensitively
     * (lower(...) queries + the ai_ci collation), so this is purely canonical.
     */
    private static String normalizeEmployeeId(String employeeId) {
        return employeeId == null || employeeId.isBlank() ? null
                : employeeId.trim().toUpperCase(java.util.Locale.ROOT);
    }

    /**
     * Employee ids are unique per organization, so the check is scoped to the
     * organization the respondent is being saved INTO — which also covers a
     * move between organizations, since that re-runs against the new one.
     * Pre-checked rather than caught: a constraint violation inside
     * @Transactional marks the transaction rollback-only and 500s at commit
     * even after we return 409. Pass excludeId on update so a respondent never
     * collides with itself.
     */
    private ResponseEntity<Map<String, String>> employeeIdConflict(String employeeId,
            Long organizationId, Long excludeId) {
        String normalized = normalizeEmployeeId(employeeId);
        if (normalized == null) {
            return null;
        }
        if (respondentUserRepository.countByEmployeeIdInOrganization(
                normalized, organizationId, excludeId) > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", organizationId == null
                            ? "This Employee ID is already in use"
                            : "This Employee ID is already in use in this organization"));
        }
        return null;
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
