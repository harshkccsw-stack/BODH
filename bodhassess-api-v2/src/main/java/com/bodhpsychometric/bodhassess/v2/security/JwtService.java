package com.bodhpsychometric.bodhassess.v2.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/** Stateless HS256 tokens: subject = user id, plus role names and the superAdmin flag. */
@Component
public class JwtService {

    public record TokenContents(Long userId, List<String> roles, boolean superAdmin) {}

    private final SecretKey key;
    private final Duration expiry;

    public JwtService(@Value("${bodh.security.jwt-secret}") String secret,
                      @Value("${bodh.security.jwt-expiry-hours}") long expiryHours) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiry = Duration.ofHours(expiryHours);
    }

    public String issue(Long userId, List<String> roles, boolean superAdmin) {
        Instant now = Instant.now();
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .claim("roles", roles)
                .claim("superAdmin", superAdmin)
                .setIssuedAt(Date.from(now))
                .setExpiration(Date.from(now.plus(expiry)))
                .signWith(key)
                .compact();
    }

    /** @return the token's contents, or null when invalid/expired. */
    public TokenContents parse(String token) {
        try {
            Claims claims = Jwts.parserBuilder().setSigningKey(key).build()
                    .parseClaimsJws(token).getBody();
            @SuppressWarnings("unchecked")
            List<String> roles = claims.get("roles", List.class);
            return new TokenContents(Long.valueOf(claims.getSubject()),
                    roles == null ? List.of() : roles,
                    Boolean.TRUE.equals(claims.get("superAdmin", Boolean.class)));
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
