package com.bodhpsychometric.security;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.UserRepository;

/**
 * The real auditing bridge: whoever the JWT authenticated is who createdBy /
 * updatedBy record. Unauthenticated work (bootstrap, migrations) audits null.
 *
 * MUST NOT run a query. This resolver is called from Hibernate's pre-persist /
 * pre-update callbacks, which fire during flush — issuing a SELECT there
 * triggers an auto-flush, which fires the callbacks again, and the request
 * dies with a StackOverflowError as soon as a transaction both mutates an
 * entity and then reads. getReferenceById only needs the id to populate the
 * FK, so it never touches the database.
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
        return Optional.of(userRepository.getReferenceById(userId));
    }
}
