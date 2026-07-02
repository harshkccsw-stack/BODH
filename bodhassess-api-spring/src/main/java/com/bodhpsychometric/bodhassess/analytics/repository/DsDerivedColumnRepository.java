package com.bodhpsychometric.bodhassess.analytics.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.analytics.model.DsDerivedColumn;

@Repository
public interface DsDerivedColumnRepository extends JpaRepository<DsDerivedColumn, Long> {

    List<DsDerivedColumn> findBySheetIdOrderBySortOrderAscIdAsc(Long sheetId);

    Optional<DsDerivedColumn> findBySheetIdAndColKey(Long sheetId, String colKey);

    boolean existsBySheetIdAndColKey(Long sheetId, String colKey);

    void deleteBySheetId(Long sheetId);
}
