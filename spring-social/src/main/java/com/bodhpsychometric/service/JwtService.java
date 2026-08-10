package com.bodhpsychometric.service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.model.auth.User;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/** Issues the signed bearer tokens the dashboard sends back on every call. */
@Service
public class JwtService {

    private final SecretKey key;
    private final long expiryMinutes;

    public JwtService(
            @Value("${app.jwt.secret:dev-only-secret-change-me-0123456789abcdef}") String secret,
            @Value("${app.jwt.expiry-minutes:720}") long expiryMinutes) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiryMinutes = expiryMinutes;
    }

    /**
     * Everything issueToken puts in the token. Enough to identify the caller
     * on every request without a database round trip — which is what makes
     * per-request actor resolution free.
     */
    public record TokenClaims(Long userId, String email, boolean superAdmin) {
    }

    /**
     * Validates signature and expiry, then returns the claims. Throws
     * {@link io.jsonwebtoken.JwtException} on any invalid or expired token.
     */
    public TokenClaims parseClaims(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return new TokenClaims(
                Long.valueOf(claims.getSubject()),
                claims.get("email", String.class),
                Boolean.TRUE.equals(claims.get("superAdmin", Boolean.class)));
    }

    /**
     * Validates signature and expiry, then returns the user id from the
     * subject claim. Throws {@link io.jsonwebtoken.JwtException} on any
     * invalid or expired token.
     */
    public Long parseUserId(String token) {
        return parseClaims(token).userId();
    }

    public String issueToken(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("email", user.getEmail())
                .claim("superAdmin", user.isSuperAdmin())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(expiryMinutes * 60)))
                .signWith(key)
                .compact();
    }
}
