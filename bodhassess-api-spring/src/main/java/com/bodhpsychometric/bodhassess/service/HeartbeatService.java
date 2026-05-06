package com.bodhpsychometric.bodhassess.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.bodhpsychometric.bodhassess.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class HeartbeatService {

    private static final Logger log = LoggerFactory.getLogger(HeartbeatService.class);
    private static final String KEY_PREFIX = "heartbeat:";

    @Autowired
    private StringRedisTemplate redis;

    @Autowired
    private ObjectMapper json;

    @Autowired
    private AppProperties props;

    public static class Record {
        public String sessionId;
        public String respondentId;
        public String instrument;
        public String groupId;
        public Integer currentIndex;
        public Integer totalQuestions;
        public String lastSeen;

        public Record() {}
    }

    public void record(String sessionId, String respondentId, String instrument, String groupId,
                       int currentIndex, int totalQuestions) {
        Record r = new Record();
        r.sessionId = sessionId;
        r.respondentId = respondentId;
        r.instrument = instrument;
        r.groupId = groupId;
        r.currentIndex = currentIndex;
        r.totalQuestions = totalQuestions;
        r.lastSeen = OffsetDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        try {
            String value = json.writeValueAsString(r);
            redis.opsForValue().set(KEY_PREFIX + sessionId, value, Duration.ofSeconds(props.getHeartbeat().getTtlSeconds()));
        } catch (Exception e) {
            log.warn("Failed to write heartbeat for session {}: {}", sessionId, e.getMessage());
        }
    }

    public Optional<Record> get(String sessionId) {
        try {
            String value = redis.opsForValue().get(KEY_PREFIX + sessionId);
            if (value == null) return Optional.empty();
            return Optional.of(json.readValue(value, Record.class));
        } catch (Exception e) {
            log.warn("Failed to read heartbeat for session {}: {}", sessionId, e.getMessage());
            return Optional.empty();
        }
    }

    public Map<String, Record> getMany(Collection<String> sessionIds) {
        if (sessionIds == null || sessionIds.isEmpty()) return Collections.emptyMap();
        List<String> keys = sessionIds.stream().map(id -> KEY_PREFIX + id).collect(Collectors.toList());
        try {
            List<String> values = redis.opsForValue().multiGet(keys);
            if (values == null) return Collections.emptyMap();
            Map<String, Record> out = new HashMap<>();
            List<String> idList = new ArrayList<>(sessionIds);
            for (int i = 0; i < idList.size() && i < values.size(); i++) {
                String v = values.get(i);
                if (v == null) continue;
                try {
                    out.put(idList.get(i), json.readValue(v, Record.class));
                } catch (Exception ignored) { /* skip malformed */ }
            }
            return out;
        } catch (Exception e) {
            log.warn("Failed batch heartbeat read ({} keys): {}", sessionIds.size(), e.getMessage());
            return Collections.emptyMap();
        }
    }

    public void clear(String sessionId) {
        try {
            redis.delete(KEY_PREFIX + sessionId);
        } catch (Exception e) {
            log.warn("Failed to clear heartbeat for session {}: {}", sessionId, e.getMessage());
        }
    }

    public long getIdleThresholdSeconds() {
        return props.getHeartbeat().getIdleThresholdSeconds();
    }
}
