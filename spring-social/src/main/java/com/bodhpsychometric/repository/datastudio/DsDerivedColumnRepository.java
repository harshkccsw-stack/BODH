package com.bodhpsychometric.repository.datastudio;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.datastudio.DsDerivedColumn;

public interface DsDerivedColumnRepository extends JpaRepository<DsDerivedColumn, Long> {

    /**
     * Evaluation order. Columns are computed in this order and materialised
     * into the row as they go, so a later formula may reference an earlier
     * one — which is exactly why the order has to be deterministic and not
     * whatever the database felt like returning.
     */
    List<DsDerivedColumn> findBySheet_DsSheetIdOrderBySortOrderAscDsDerivedColumnIdAsc(Long dsSheetId);

    Optional<DsDerivedColumn> findBySheet_DsSheetIdAndColKey(Long dsSheetId, String colKey);

    boolean existsBySheet_DsSheetIdAndColKey(Long dsSheetId, String colKey);

    long countBySheet_DsSheetId(Long dsSheetId);

    void deleteBySheet_DsSheetId(Long dsSheetId);
}
