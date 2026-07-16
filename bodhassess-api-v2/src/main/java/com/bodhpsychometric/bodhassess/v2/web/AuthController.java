package com.bodhpsychometric.bodhassess.v2.web;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.people.UserStatus;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;
import com.bodhpsychometric.bodhassess.v2.security.JwtService;

/**
 * Login = email + date of birth (the product's permanent credential, kept by
 * explicit decision). Both dashboard and portal resolve against the same
 * identity — that alone fixes the legacy broken-practitioner-login bug.
 */
@RestController
@RequestMapping("/api/v2/auth")
public class AuthController {

    public record LoginRequest(String email, LocalDate dob) {}
    public record LoginResponse(String token, Long userId, String email, String name,
                                List<String> roles, boolean superAdmin) {}

    private final UserRepository userRepository;
    private final JwtService jwtService;

    public AuthController(UserRepository userRepository, JwtService jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
    }

    @PostMapping("/login")
    @Transactional
    public LoginResponse login(@RequestBody LoginRequest body) {
        User user = userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull(
                        body.email() == null ? "" : body.email())
                .orElseThrow(AuthController::badCredentials);
        if (user.getStatus() != UserStatus.ACTIVE
                || user.getDob() == null
                || !user.getDob().equals(body.dob())) {
            throw badCredentials();
        }
        user.setLastLoginAt(OffsetDateTime.now());
        List<String> roles = user.getRoles().stream()
                .map(r -> r.getRole().getName()).sorted().toList();
        String token = jwtService.issue(user.getId(), roles, user.isSuperAdmin());
        return new LoginResponse(token, user.getId(), user.getEmail(), user.getName(),
                roles, user.isSuperAdmin());
    }

    @GetMapping("/me")
    @Transactional(readOnly = true)
    public LoginResponse me() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Long userId)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        List<String> roles = user.getRoles().stream()
                .map(r -> r.getRole().getName()).sorted().toList();
        return new LoginResponse(null, user.getId(), user.getEmail(), user.getName(),
                roles, user.isSuperAdmin());
    }

    private static ResponseStatusException badCredentials() {
        // One message for unknown email and wrong dob — no account enumeration.
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials");
    }
}
