package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HealthService {

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public Map<String, Object> check() {
        boolean dbOk;
        try {
            em.createNativeQuery("SELECT 1").getSingleResult();
            dbOk = true;
        } catch (Exception e) {
            dbOk = false;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", dbOk ? "healthy" : "degraded");
        body.put("service", "bodhassess-api");
        body.put("version", "1.0.0-spring");
        body.put("database", dbOk);
        body.put("time", OffsetDateTime.now());
        return body;
    }
}
