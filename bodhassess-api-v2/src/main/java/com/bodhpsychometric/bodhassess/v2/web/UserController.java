package com.bodhpsychometric.bodhassess.v2.web;

import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.people.UserStatus;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;
import com.bodhpsychometric.bodhassess.domain.service.UserService;

@RestController
@RequestMapping("/api/v2/users")
public class UserController {

    public record CreateUserRequest(String email, String name, LocalDate dob, String phone,
                                    String gender, boolean consent, List<String> roles) {}
    public record ProfileRequest(String name, String phone, String gender, LocalDate dob) {}
    public record StatusRequest(UserStatus status) {}

    public record UserDto(Long id, String email, String name, LocalDate dob, String phone,
                          String gender, UserStatus status, boolean superAdmin, boolean consent,
                          List<String> roles) {
        static UserDto from(User u) {
            return new UserDto(u.getId(), u.getEmail(), u.getName(), u.getDob(), u.getPhone(),
                    u.getGender(), u.getStatus(), u.isSuperAdmin(), u.isConsent(),
                    u.getRoles().stream().map(r -> r.getRole().getName()).sorted().toList());
        }
    }

    private final UserService users;
    private final UserRepository userRepository;

    public UserController(UserService users, UserRepository userRepository) {
        this.users = users;
        this.userRepository = userRepository;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserDto create(@RequestBody CreateUserRequest body) {
        return UserDto.from(users.createUser(body.email(), body.name(), body.dob(), body.phone(),
                body.gender(), body.consent(), body.roles()));
    }

    @GetMapping("/{id}")
    public UserDto get(@PathVariable Long id) {
        return UserDto.from(users.get(id));
    }

    @GetMapping
    public List<UserDto> list(@RequestParam(required = false) String role,
                              @RequestParam(required = false) String search) {
        List<User> result;
        if (role != null && !role.isBlank()) {
            result = users.byRole(role);
        } else if (search != null && !search.isBlank()) {
            result = userRepository.findByNameContainingIgnoreCaseAndDeletedAtIsNull(search);
        } else {
            result = userRepository.findByDeletedAtIsNull();
        }
        return result.stream().map(UserDto::from).toList();
    }

    @PutMapping("/{id}")
    public UserDto updateProfile(@PathVariable Long id, @RequestBody ProfileRequest body) {
        return UserDto.from(users.updateProfile(id, body.name(), body.phone(), body.gender(), body.dob()));
    }

    @PutMapping("/{id}/status")
    public UserDto setStatus(@PathVariable Long id, @RequestBody StatusRequest body) {
        return UserDto.from(users.setStatus(id, body.status()));
    }

    @PostMapping("/{id}/roles/{roleName}")
    @ResponseStatus(HttpStatus.CREATED)
    public void assignRole(@PathVariable Long id, @PathVariable String roleName) {
        users.assignRole(id, roleName);
    }

    @DeleteMapping("/{id}/roles/{roleName}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeRole(@PathVariable Long id, @PathVariable String roleName) {
        users.revokeRole(id, roleName);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void bin(@PathVariable Long id) {
        users.binUser(id);
    }

    @PostMapping("/{id}/restore")
    public void restore(@PathVariable Long id) {
        users.restoreUser(id);
    }
}
