package com.bodhpsychometric.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * The lock on every server-to-server door MemoryMesh knocks on.
 *
 * <p>One shared secret, {@code app.sync.memorymesh-key}, presented in
 * {@value #KEY_HEADER}. Compared in constant time. When the key is not
 * configured the answer is 403 for everyone: an environment that never set
 * it up has nothing listening rather than a door with no lock.
 */
@Component
public class SyncKeyGuard {

    public static final String KEY_HEADER = "X-Sync-Key";

    private final byte[] configuredKey;

    public SyncKeyGuard(@Value("${app.sync.memorymesh-key:}") String configuredKey) {
        this.configuredKey = configuredKey == null || configuredKey.isBlank()
                ? null
                : configuredKey.trim().getBytes(StandardCharsets.UTF_8);
    }

    /** Null when the caller may proceed; otherwise the response to send instead. */
    public ResponseEntity<Map<String, String>> reject(String presentedKey) {
        if (configuredKey == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("message", "MemoryMesh sync is not enabled on this server"));
        }
        if (presentedKey == null || !MessageDigest.isEqual(
                configuredKey, presentedKey.trim().getBytes(StandardCharsets.UTF_8))) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid sync key"));
        }
        return null;
    }
}
