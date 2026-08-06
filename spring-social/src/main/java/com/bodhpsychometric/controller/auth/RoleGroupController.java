package com.bodhpsychometric.controller.auth;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

import com.bodhpsychometric.dto.RoleGroupRequest;
import com.bodhpsychometric.dto.RoleGroupResponse;
import com.bodhpsychometric.model.auth.Role;
import com.bodhpsychometric.model.auth.RoleGroup;
import com.bodhpsychometric.repository.auth.RoleGroupRepository;
import com.bodhpsychometric.repository.auth.RoleRepository;
import com.bodhpsychometric.repository.auth.UserRepository;

import jakarta.validation.Valid;

/**
 * CRUD for role groups — the named bundle of roles that is the only thing a
 * user actually holds. Their access is the union of the paths of every role
 * inside; there are no deny rules, so nothing has to be resolved.
 *
 * Roles are SHARED, so nothing here cascades: emptying or deleting a group
 * unlinks its roles and leaves them alone. A group still assigned to somebody
 * is refused (409) rather than silently stripping people of access.
 */
@RestController
@RequestMapping("/api/role-groups")
@Transactional
public class RoleGroupController {

    @Autowired
    private RoleGroupRepository roleGroupRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/getAll")
    public List<RoleGroupResponse> getAllRoleGroups() {
        return roleGroupRepository.findAllForListing().stream()
                .map(group -> RoleGroupResponse.from(group,
                        userRepository.countByRoleGroup_RoleGroupId(group.getRoleGroupId())))
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<RoleGroupResponse> getRoleGroupById(@PathVariable Long id) {
        return roleGroupRepository.findForDetail(id)
                .map(group -> ResponseEntity.ok(RoleGroupResponse.from(group,
                        userRepository.countByRoleGroup_RoleGroupId(id))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createRoleGroup(@Valid @RequestBody RoleGroupRequest request) {
        String name = request.name().trim();
        if (roleGroupRepository.existsByNameIgnoreCase(name)) {
            return duplicateName();
        }
        Set<Role> roles = resolveRoles(request.roleIds());
        if (roles == null) {
            return unknownRole();
        }
        RoleGroup group = new RoleGroup();
        apply(group, request, name, roles);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(RoleGroupResponse.from(roleGroupRepository.save(group), 0));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateRoleGroup(@PathVariable Long id,
            @Valid @RequestBody RoleGroupRequest request) {
        RoleGroup group = roleGroupRepository.findById(id).orElse(null);
        if (group == null) {
            return ResponseEntity.notFound().build();
        }
        String name = request.name().trim();
        if (roleGroupRepository.existsByNameIgnoreCaseAndRoleGroupIdNot(name, id)) {
            return duplicateName();
        }
        Set<Role> roles = resolveRoles(request.roleIds());
        if (roles == null) {
            return unknownRole();
        }
        apply(group, request, name, roles);
        return ResponseEntity.ok(RoleGroupResponse.from(roleGroupRepository.save(group),
                userRepository.countByRoleGroup_RoleGroupId(id)));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteRoleGroup(@PathVariable Long id) {
        RoleGroup group = roleGroupRepository.findById(id).orElse(null);
        if (group == null) {
            return ResponseEntity.notFound().build();
        }
        long members = userRepository.countByRoleGroup_RoleGroupId(id);
        if (members > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "This group is assigned to " + members
                            + " user(s) — reassign them first"));
        }
        // Clearing the join rows first, so the delete drops the membership and
        // never the shared roles themselves.
        group.getRoles().clear();
        roleGroupRepository.delete(group);
        return ResponseEntity.noContent().build();
    }

    private void apply(RoleGroup group, RoleGroupRequest request, String name, Set<Role> roles) {
        group.setName(name);
        group.setDescription(request.description() == null || request.description().isBlank()
                ? null : request.description().trim());
        group.getRoles().clear();
        group.getRoles().addAll(roles);
    }

    /** Resolves every id or returns null if one is unknown — all or nothing. */
    private Set<Role> resolveRoles(List<Long> roleIds) {
        Set<Role> roles = new LinkedHashSet<>();
        for (Long roleId : roleIds) {
            Role role = roleId == null ? null : roleRepository.findById(roleId).orElse(null);
            if (role == null) {
                return null;
            }
            roles.add(role);
        }
        return roles;
    }

    private ResponseEntity<Map<String, String>> duplicateName() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "A group with this name already exists"));
    }

    private ResponseEntity<Map<String, String>> unknownRole() {
        return ResponseEntity.badRequest()
                .body(Map.of("message", "One of the selected roles no longer exists"));
    }
}
