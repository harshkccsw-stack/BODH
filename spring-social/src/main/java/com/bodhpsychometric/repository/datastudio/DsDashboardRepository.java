package com.bodhpsychometric.repository.datastudio;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.datastudio.DsDashboard;

public interface DsDashboardRepository extends JpaRepository<DsDashboard, Long> {

    List<DsDashboard> findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsDashboardIdAsc(Long dsWorkbookId);

    long countByWorkbook_DsWorkbookId(Long dsWorkbookId);

    /** Dashboard + its workbook, so the access check never lazy-loads. */
    @Query("select d from DsDashboard d join fetch d.workbook w join fetch w.owner "
            + "where d.dsDashboardId = :dsDashboardId")
    Optional<DsDashboard> findWithWorkbook(Long dsDashboardId);
}
