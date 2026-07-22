package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.DemographicField;

@Repository
public interface DemographicFieldRepository extends JpaRepository<DemographicField, String> {

    @Query("SELECT d FROM DemographicField d ORDER BY d.sortOrder ASC, d.label ASC")
    List<DemographicField> findAllOrdered();

    @Query("SELECT d FROM DemographicField d WHERE d.active = TRUE ORDER BY d.sortOrder ASC, d.label ASC")
    List<DemographicField> findActiveOrdered();
}
