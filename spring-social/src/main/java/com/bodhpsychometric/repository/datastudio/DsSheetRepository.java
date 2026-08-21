package com.bodhpsychometric.repository.datastudio;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.datastudio.DsSheet;

public interface DsSheetRepository extends JpaRepository<DsSheet, Long> {

    List<DsSheet> findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsSheetIdAsc(Long dsWorkbookId);

    long countByWorkbook_DsWorkbookId(Long dsWorkbookId);

    /** Sheet + its workbook, so the access check never lazy-loads. */
    @Query("select s from DsSheet s join fetch s.workbook w join fetch w.owner "
            + "where s.dsSheetId = :dsSheetId")
    Optional<DsSheet> findWithWorkbook(Long dsSheetId);
}
