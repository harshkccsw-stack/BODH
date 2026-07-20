package com.bodhpsychometric.security;

import java.util.Optional;

import com.bodhpsychometric.model.auth.User;

/**
 * Bridge between the domain's auditing and whatever authentication mechanism
 * the host application uses. The API module implements this against its
 * security context at cutover; the domain module stays security-framework
 * agnostic.
 */
@FunctionalInterface
public interface CurrentUserResolver {

    Optional<User> currentUser();
}
