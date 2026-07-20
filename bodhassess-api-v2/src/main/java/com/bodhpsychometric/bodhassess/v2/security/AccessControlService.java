package com.bodhpsychometric.bodhassess.v2.security;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.AntPathMatcher;

import com.bodhpsychometric.auth.User;
import com.bodhpsychometric.auth.UserStatus;
import com.bodhpsychometric.bodhassess.domain.auth.unnecessary.UserRole;
import com.bodhpsychometric.repository.UserRepository;

/**
 * The RBAC decision: superAdmin passes everything; everyone else needs one
 * of their roles' url-path patterns to match. Reads the database per request
 * so admin edits to role paths apply immediately — cache later if it ever
 * shows up in a profile.
 */
@Service
public class AccessControlService {

    private final UserRepository userRepository;
    private final AntPathMatcher matcher = new AntPathMatcher();

    public AccessControlService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public boolean mayAccess(Long userId, String path) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId).orElse(null);
        if (user == null || user.getStatus() != UserStatus.ACTIVE) {
            return false;
        }
        if (user.isSuperAdmin()) {
            return true;
        }
        for (UserRole userRole : user.getRoles()) {
            for (String pattern : userRole.getRole().getUrlPaths()) {
                if (matcher.match(pattern, path)) {
                    return true;
                }
            }
        }
        return false;
    }
}
