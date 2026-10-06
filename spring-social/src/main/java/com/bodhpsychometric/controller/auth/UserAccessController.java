package com.bodhpsychometric.controller.auth;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.DashboardUserResponse;
import com.bodhpsychometric.dto.RoleGroupAssignRequest;
import com.bodhpsychometric.model.auth.PractitionerUser;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.RoleGroup;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.auth.RoleGroupRepository;
import com.bodhpsychometric.repository.auth.UserRepository;

/**
 * The "assign role group" screen: every identity, and which group each of
 * them holds. Holding a group opens the dashboard (see DashboardAuthService),
 * so a respondent can be given a role without a practitioner profile. Assignment lives here rather than on the practitioner
 * form so that granting access is its own deliberate act — creating a
 * practitioner does not hand out any pages.
 *
 * A user holds exactly one group; assigning replaces whatever was there, and
 * a null id clears it (back to the dashboard-only default). The change takes
 * effect on the person's next /api/auth/me — their current token keeps
 * working, it just resolves to the new paths on the next page load.
 */
@RestController
@RequestMapping("/api/user-access")
@Transactional
public class UserAccessController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PractitionerUserRepository practitionerUserRepository;

    @Autowired
    private RespondentUserRepository respondentUserRepository;

    @Autowired
    private RoleGroupRepository roleGroupRepository;

    @GetMapping("/getAll")
    public List<DashboardUserResponse> getDashboardUsers() {
        // Names live on the profiles, so they come from two listing queries
        // rather than a join per row. Practitioner name wins when a person
        // holds both; a superadmin with no profile simply has none.
        Map<Long, String> practitionerNames = new HashMap<>();
        for (PractitionerUser practitioner : practitionerUserRepository.findAllForListing()) {
            practitionerNames.put(practitioner.getUser().getId(), practitioner.getName());
        }
        Map<Long, String> respondentNames = new HashMap<>();
        for (RespondentUser respondent : respondentUserRepository.findAllForListing()) {
            respondentNames.put(respondent.getUser().getId(), respondent.getName());
        }
        return userRepository.findAllForAccess().stream()
                .map(user -> toResponse(user, practitionerNames, respondentNames))
                .toList();
    }

    /**
     * Makes ANY identity a superadmin — practitioner or respondent alike
     * (2026-10-05; the practitioner page's own toggle only reached
     * practitioners). The flag is full access, the four access-admin pages
     * included, which no role can grant. Any group the person held is
     * cleared: assignRoleGroup refuses a group on a superadmin, so leaving
     * one behind would store access nothing depends on.
     */
    @PutMapping("/assign-superadmin/{userId}")
    public ResponseEntity<?> assignSuperAdmin(@PathVariable Long userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        user.setSuperAdmin(true);
        user.setRoleGroup(null);
        userRepository.save(user);
        return ResponseEntity.ok(toResponse(user));
    }

    /**
     * Takes the flag away again; the person drops to no group (dashboard only
     * if they are a practitioner, no dashboard otherwise) until one is
     * assigned. The last superadmin cannot be revoked — nobody could reach
     * this screen to fix it.
     */
    @PutMapping("/revoke-superadmin/{userId}")
    public ResponseEntity<?> revokeSuperAdmin(@PathVariable Long userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }
        if (user.isSuperAdmin() && userRepository.countBySuperAdminTrue() <= 1) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "Cannot revoke the last superadmin — make someone else superadmin first"));
        }
        user.setSuperAdmin(false);
        userRepository.save(user);
        return ResponseEntity.ok(toResponse(user));
    }

    @PutMapping("/assign-role-group/{userId}")
    public ResponseEntity<?> assignRoleGroup(@PathVariable Long userId,
            @RequestBody RoleGroupAssignRequest request) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.notFound().build();
        }

        RoleGroup group = null;
        if (request.roleGroupId() != null) {
            group = roleGroupRepository.findById(request.roleGroupId()).orElse(null);
            if (group == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Role group not found"));
            }
        }

        // A superadmin bypasses the path checks entirely, so a group on that
        // row would read as access it does not depend on. Refuse rather than
        // store something misleading.
        if (user.isSuperAdmin() && group != null) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "Superadmins already have full access — no group applies"));
        }

        user.setRoleGroup(group);
        userRepository.save(user);

        return ResponseEntity.ok(toResponse(user));
    }

    /** One row, for the write endpoints — profile names looked up by user id. */
    private DashboardUserResponse toResponse(User user) {
        Long userId = user.getId();
        Map<Long, String> practitionerNames = new HashMap<>();
        practitionerUserRepository.findByUser_Id(userId)
                .ifPresent(p -> practitionerNames.put(userId, p.getName()));
        Map<Long, String> respondentNames = new HashMap<>();
        respondentUserRepository.findByUser_Id(userId)
                .ifPresent(r -> respondentNames.put(userId, r.getName()));
        return toResponse(user, practitionerNames, respondentNames);
    }

    private static DashboardUserResponse toResponse(User user,
            Map<Long, String> practitionerNames, Map<Long, String> respondentNames) {
        RoleGroup group = user.getRoleGroup();
        boolean practitioner = practitionerNames.containsKey(user.getId());
        boolean respondent = respondentNames.containsKey(user.getId());
        String name = practitioner ? practitionerNames.get(user.getId()) : respondentNames.get(user.getId());
        return new DashboardUserResponse(
                user.getId(),
                user.getSerialId(),
                name,
                user.getEmail(),
                user.isSuperAdmin(),
                group == null ? null : group.getRoleGroupId(),
                group == null ? null : group.getName(),
                practitioner,
                respondent);
    }
}
