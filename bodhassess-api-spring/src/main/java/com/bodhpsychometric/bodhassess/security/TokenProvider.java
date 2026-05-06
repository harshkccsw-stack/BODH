package com.bodhpsychometric.bodhassess.security;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Date;
import java.util.List;

import javax.crypto.SecretKey;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.bodhassess.config.AppProperties;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.Keys;
import io.jsonwebtoken.security.SignatureException;

@Service
public class TokenProvider {

    private static final Logger logger = LoggerFactory.getLogger(TokenProvider.class);
    private static final String CLAIM_USER_TYPE = "userType";
    private static final String CLAIM_EMAIL = "email";
    private static final String CLAIM_ROLES = "roles";

    private final AppProperties appProperties;
    private final SecretKey signingKey;

    public TokenProvider(AppProperties appProperties) {
        this.appProperties = appProperties;
        this.signingKey = Keys.hmacShaKeyFor(
            appProperties.getAuth().getTokenSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String createToken(String userId, String email, UserPrincipal.UserType userType, List<String> roles) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + appProperties.getAuth().getTokenExpirationMsec());

        return Jwts.builder()
                .setSubject(userId)
                .claim(CLAIM_EMAIL, email)
                .claim(CLAIM_USER_TYPE, userType.name())
                .claim(CLAIM_ROLES, roles == null ? Collections.emptyList() : roles)
                .setIssuedAt(now)
                .setExpiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    public UserPrincipal getPrincipalFromToken(String token) {
        Claims claims = Jwts.parserBuilder()
                .setSigningKey(signingKey)
                .build()
                .parseClaimsJws(token)
                .getBody();

        String userId = claims.getSubject();
        String email = claims.get(CLAIM_EMAIL, String.class);
        String userTypeStr = claims.get(CLAIM_USER_TYPE, String.class);
        @SuppressWarnings("unchecked")
        List<String> roles = claims.get(CLAIM_ROLES, List.class);

        UserPrincipal.UserType userType = UserPrincipal.UserType.valueOf(userTypeStr);
        return new UserPrincipal(userId, email, userType, roles);
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(signingKey).build().parseClaimsJws(token);
            return true;
        } catch (SignatureException ex) {
            logger.error("Invalid JWT signature");
        } catch (MalformedJwtException ex) {
            logger.error("Invalid JWT token");
        } catch (ExpiredJwtException ex) {
            logger.error("Expired JWT token");
        } catch (UnsupportedJwtException ex) {
            logger.error("Unsupported JWT token");
        } catch (IllegalArgumentException ex) {
            logger.error("JWT claims string is empty");
        }
        return false;
    }
}
