package com.bodhpsychometric.bodhassess.v2.security;

import java.util.function.Supplier;

import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;

/**
 * Bridges Spring Security's authorization hook to {@link AccessControlService}.
 * Anonymous requests are denied here, which the exception translation filter
 * turns into a 401 via the entry point.
 */
@Component
public class RoleUrlPathAuthorizationManager
        implements AuthorizationManager<RequestAuthorizationContext> {

    private final AccessControlService accessControl;

    public RoleUrlPathAuthorizationManager(AccessControlService accessControl) {
        this.accessControl = accessControl;
    }

    @Override
    public AuthorizationDecision check(Supplier<Authentication> authenticationSupplier,
                                       RequestAuthorizationContext context) {
        Authentication authentication = authenticationSupplier.get();
        if (authentication == null || !(authentication.getPrincipal() instanceof Long userId)) {
            return new AuthorizationDecision(false);
        }
        return new AuthorizationDecision(
                accessControl.mayAccess(userId, context.getRequest().getRequestURI()));
    }
}
