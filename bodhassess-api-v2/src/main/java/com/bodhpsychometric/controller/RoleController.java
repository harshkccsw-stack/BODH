package com.bodhpsychometric.controller;

import java.util.List;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.model.auth.Role;
import com.bodhpsychometric.repository.RoleRepository;
import com.bodhpsychometric.exception.NotFoundException;

/**
 * Read-only view of the RBAC roles — enough for the screens that assign roles
 * to a user. Role authoring (create/edit access paths, delete) belongs to the
 * roles &amp; permissions phase and is deliberately not exposed yet: the seeded
 * allow-lists are what the platform runs on.
 */
@RestController
@RequestMapping("/api/v2/roles")
public class RoleController {

    public record RoleDto(Long id, String name, String description,
                          List<String> apiPaths, List<String> pagePaths) {
        static RoleDto from(Role role) {
            return new RoleDto(role.getId(), role.getName(), role.getDescription(),
                    role.getUrlPaths().stream().sorted().toList(),
                    List.of());
        }
    }

    private final RoleRepository roleRepository;

    public RoleController(RoleRepository roleRepository) {
        this.roleRepository = roleRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<RoleDto> list() {
        return roleRepository.findAll().stream()
                .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
                .map(RoleDto::from).toList();
    }

    @GetMapping("/{name}")
    @Transactional(readOnly = true)
    public RoleDto get(@PathVariable String name) {
        return RoleDto.from(roleRepository.findByName(name)
                .orElseThrow(() -> new NotFoundException("Role", name)));
    }
}
