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
import com.bodhpsychometric.model.auth.RoleGroup;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.auth.PractitionerUserRepository;
import com.bodhpsychometric.repository.auth.RoleGroupRepository;
import com.bodhpsychometric.repository.auth.UserRepository;

/**
 * The "assign role group" screen: who can open the dashboard, and which group
 * each of them holds. Assignment lives here rather than on the practitioner
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
    private RoleGroupRepository roleGroupRepository;

    @GetMapping("/getAll")
    public List<DashboardUserResponse> getDashboardUsers() {
        // Names live on the practitioner profile, so they come from one extra
        // listing query rather than a join per row. A superadmin with no
        // profile simply has none.
        Map<Long, String> namesByUserId = new HashMap<>();
        for (PractitionerUser practitioner : practitionerUserRepository.findAllForListing()) {
            namesByUserId.put(practitioner.getUser().getId(), practitioner.getName());
        }
        return userRepository.findDashboardUsers().stream()
                .map(user -> toResponse(user, namesByUserId.get(user.getId())))
                .toList();
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

        String name = practitionerUserRepository.findByUser_Id(userId)
                .map(PractitionerUser::getName).orElse(null);
        return ResponseEntity.ok(toResponse(user, name));
    }

    private static DashboardUserResponse toResponse(User user, String name) {
        RoleGroup group = user.getRoleGroup();
        return new DashboardUserResponse(
                user.getId(),
                user.getSerialId(),
                name,
                user.getEmail(),
                user.isSuperAdmin(),
                group == null ? null : group.getRoleGroupId(),
                group == null ? null : group.getName());
    }
}
