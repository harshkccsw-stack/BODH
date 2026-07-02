package com.bodhpsychometric.bodhassess.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.config.AppProperties;
import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.UnauthorizedAccessException;
import com.bodhpsychometric.bodhassess.payload.AdminLoginRequest;
import com.bodhpsychometric.bodhassess.payload.AdminLoginResponse;
import com.bodhpsychometric.bodhassess.security.TokenProvider;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Single-user admin login backed by env vars (app.admin.username /
 * app.admin.password). The credential is the env value itself — no DB row,
 * no hash file — so a constant-time byte comparison is sufficient.
 *
 * To change the password in production, update the APP_ADMIN_PASSWORD env
 * var and restart the API.
 */
@Service
public class AdminService {

    @Autowired
    private AppProperties appProperties;

    @Autowired
    private TokenProvider tokenProvider;

    public AdminLoginResponse login(AdminLoginRequest req) {
        if (req == null || !StringUtils.hasText(req.getUsername()) || !StringUtils.hasText(req.getPassword())) {
            throw new BadRequestException("username and password required");
        }

        String configuredUser = appProperties.getAdmin().getUsername();
        String configuredPass = appProperties.getAdmin().getPassword();
        if (!StringUtils.hasText(configuredUser) || !StringUtils.hasText(configuredPass)) {
            // Misconfiguration — refuse to authenticate rather than allow
            // an empty-credential login.
            throw new UnauthorizedAccessException("admin login is not configured");
        }

        boolean userOk = constantTimeEquals(req.getUsername(), configuredUser);
        boolean passOk = constantTimeEquals(req.getPassword(), configuredPass);
        if (!(userOk && passOk)) {
            throw new UnauthorizedAccessException("invalid credentials");
        }

        String token = tokenProvider.createToken(
                configuredUser,
                configuredUser + "@admin.local",
                UserPrincipal.UserType.ADMIN,
                Collections.singletonList("ADMIN"));

        return new AdminLoginResponse(token, new AdminLoginResponse.AdminInfo(configuredUser));
    }

    public AdminLoginResponse.AdminInfo me(UserPrincipal principal) {
        if (principal == null || principal.getUserType() != UserPrincipal.UserType.ADMIN) {
            throw new UnauthorizedAccessException("not an admin token");
        }
        return new AdminLoginResponse.AdminInfo(principal.getId());
    }

    private static boolean constantTimeEquals(String a, String b) {
        byte[] aa = a.getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(aa, bb);
    }
}
