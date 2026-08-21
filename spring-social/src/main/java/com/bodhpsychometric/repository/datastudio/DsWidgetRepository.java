package com.bodhpsychometric.repository.datastudio;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.datastudio.DsWidget;

public interface DsWidgetRepository extends JpaRepository<DsWidget, Long> {

    List<DsWidget> findByDashboard_DsDashboardIdOrderBySortOrderAscDsWidgetIdAsc(Long dsDashboardId);

    long countByDashboard_DsDashboardId(Long dsDashboardId);

    /**
     * Deleting a sheet is REFUSED while a tile still binds to it — pre-checked
     * with this rather than left to the foreign key, because the point is a
     * 409 that names the problem, not a 500 at commit time.
     */
    long countBySheet_DsSheetId(Long dsSheetId);

    /** Widget + dashboard + workbook, so the access check never lazy-loads. */
    @Query("select x from DsWidget x join fetch x.dashboard d join fetch d.workbook w join fetch w.owner "
            + "where x.dsWidgetId = :dsWidgetId")
    Optional<DsWidget> findWithWorkbook(Long dsWidgetId);

    void deleteByDashboard_DsDashboardId(Long dsDashboardId);
}
