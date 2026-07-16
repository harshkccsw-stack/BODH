package com.bodhpsychometric.bodhassess.v2.security;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.bodhpsychometric.bodhassess.domain.auditing.CurrentUserResolver;
import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;

/**
 * The real auditing bridge: whoever the JWT authenticated is who createdBy /
 * updatedBy record. Unauthenticated work (bootstrap, migrations) audits null.
 */
@Component
public class SecurityCurrentUserResolver implements CurrentUserResolver {

    private final UserRepository userRepository;

    public SecurityCurrentUserResolver(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public Optional<User> currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof Long userId)) {
            return Optional.empty();
        }
        return userRepository.findByIdAndDeletedAtIsNull(userId);
    }
}
