package com.bodhpsychometric.repository.datastudio;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.datastudio.DsWorkbookShare;

public interface DsWorkbookShareRepository extends JpaRepository<DsWorkbookShare, Long> {

    /** Share list for the workbook panel — the grantee is fetched for the DTO. */
    @Query("select s from DsWorkbookShare s join fetch s.sharedWith u "
            + "where s.workbook.dsWorkbookId = :dsWorkbookId order by u.email asc")
    List<DsWorkbookShare> findForWorkbook(Long dsWorkbookId);

    Optional<DsWorkbookShare> findByWorkbook_DsWorkbookIdAndSharedWith_Id(
            Long dsWorkbookId, Long sharedWithUserId);

    /** The access check's one query — role, or empty when there is no grant. */
    @Query("select s.role from DsWorkbookShare s "
            + "where s.workbook.dsWorkbookId = :dsWorkbookId and s.sharedWith.id = :userId")
    Optional<String> findRole(Long dsWorkbookId, Long userId);

    void deleteByWorkbook_DsWorkbookId(Long dsWorkbookId);
}
