package com.bodhpsychometric.repository.measures;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.taxonomy.MeasuredQuality;

public interface MeasuredQualityRepository extends JpaRepository<MeasuredQuality, Long> {

    /**
     * MQ names are unique, ignoring case (2026-09-30). The pre-check behind
     * the 409 on create; V38's unique key is the backstop, and MySQL's
     * utf8mb4_0900_ai_ci collation makes that key case-insensitive too.
     */
    boolean existsByNameIgnoreCase(String name);

    /** The same check on rename — any OTHER MQ with this name. */
    boolean existsByNameIgnoreCaseAndMeasuredQualityIdNot(String name, Long measuredQualityId);
}
