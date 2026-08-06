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

import com.bodhpsychometric.dto.RoleRequest;
import com.bodhpsychometric.dto.RoleResponse;
import com.bodhpsychometric.model.auth.Role;
import com.bodhpsychometric.repository.auth.RoleGroupRepository;
import com.bodhpsychometric.repository.auth.RoleRepository;

import jakarta.validation.Valid;

/**
 * CRUD for roles — one named bundle of frontend routes. A role is never given
 * to a person directly: it goes into a RoleGroup, and the group is what a
 * user holds.
 *
 * The name is unique, and a role still bundled into a group cannot be
 * deleted; both are PRE-checked with exists queries, because catching the
 * constraint inside @Transactional marks the transaction rollback-only and
 * turns a tidy 409 into a 500 at commit.
 *
 * NOTE: these endpoints are unauthenticated like the rest of the API. The
 * dashboard hides them from non-superadmins, but that is navigation control,
 * not a boundary — it closes when the JWT filter lands.
 */
@RestController
@RequestMapping("/api/roles")
@Transactional
public class RoleController {

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private RoleGroupRepository roleGroupRepository;

    @GetMapping("/getAll")
    public List<RoleResponse> getAllRoles() {
        return roleRepository.findAllForListing().stream()
                .map(role -> RoleResponse.from(role, roleGroupRepository.countByRoles_Id(role.getId())))
                .toList();
    }

    @GetMapping("/getById/{id}")
    public ResponseEntity<RoleResponse> getRoleById(@PathVariable Long id) {
        return roleRepository.findForDetail(id)
                .map(role -> ResponseEntity.ok(
                        RoleResponse.from(role, roleGroupRepository.countByRoles_Id(role.getId()))))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/create")
    public ResponseEntity<?> createRole(@Valid @RequestBody RoleRequest request) {
        String name = request.name().trim();
        if (roleRepository.existsByNameIgnoreCase(name)) {
            return duplicateName();
        }
        Role role = new Role();
        apply(role, request, name);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(RoleResponse.from(roleRepository.save(role), 0));
    }

    @PutMapping("/update/{id}")
    public ResponseEntity<?> updateRole(@PathVariable Long id, @Valid @RequestBody RoleRequest request) {
        Role role = roleRepository.findById(id).orElse(null);
        if (role == null) {
            return ResponseEntity.notFound().build();
        }
        String name = request.name().trim();
        if (roleRepository.existsByNameIgnoreCaseAndIdNot(name, id)) {
            return duplicateName();
        }
        apply(role, request, name);
        return ResponseEntity.ok(RoleResponse.from(roleRepository.save(role),
                roleGroupRepository.countByRoles_Id(id)));
    }

    @DeleteMapping("/delete/{id}")
    public ResponseEntity<?> deleteRole(@PathVariable Long id) {
        Role role = roleRepository.findById(id).orElse(null);
        if (role == null) {
            return ResponseEntity.notFound().build();
        }
        long groups = roleGroupRepository.countByRoles_Id(id);
        if (groups > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message", "This role is used by " + groups
                            + " group(s) — remove it from them first"));
        }
        roleRepository.delete(role);
        return ResponseEntity.noContent().build();
    }

    /**
     * Writes the request onto the entity. urlPaths is REPLACED, never merged:
     * the editor sends the full tick-list, so a path missing from it means
     * "revoked". Paths are trimmed and de-duplicated (a LinkedHashSet keeps
     * the editor's order for anything that reads it before the response sorts
     * them), and a trailing slash is dropped so "/reports/" and "/reports"
     * cannot both exist and drift.
     */
    private void apply(Role role, RoleRequest request, String name) {
        role.setName(name);
        role.setDescription(request.description() == null || request.description().isBlank()
                ? null : request.description().trim());

        Set<String> paths = new LinkedHashSet<>();
        for (String raw : request.urlPaths()) {
            String path = raw.trim();
            if (path.length() > 1 && path.endsWith("/")) {
                path = path.substring(0, path.length() - 1);
            }
            paths.add(path);
        }
        role.getUrlPaths().clear();
        role.getUrlPaths().addAll(paths);
    }

    private ResponseEntity<Map<String, String>> duplicateName() {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "A role with this name already exists"));
    }
}
