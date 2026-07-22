package com.bodhpsychometric.bodhassess.analytics.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbook;

@Repository
public interface DsWorkbookRepository extends JpaRepository<DsWorkbook, Long> {

    /** Workbooks the user owns OR has been granted access to, newest first. */
    @Query("SELECT w FROM DsWorkbook w WHERE w.ownerId = :userId "
            + "OR w.id IN (SELECT s.workbookId FROM DsWorkbookShare s WHERE s.sharedWithUserId = :userId) "
            + "ORDER BY w.updatedAt DESC")
    List<DsWorkbook> findAccessibleBy(@Param("userId") String userId);
}
