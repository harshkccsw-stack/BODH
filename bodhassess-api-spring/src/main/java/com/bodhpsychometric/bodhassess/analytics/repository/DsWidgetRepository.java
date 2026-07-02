package com.bodhpsychometric.bodhassess.analytics.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.analytics.model.DsWidget;

@Repository
public interface DsWidgetRepository extends JpaRepository<DsWidget, Long> {

    List<DsWidget> findByDashboardIdOrderBySortOrderAscIdAsc(Long dashboardId);

    void deleteByDashboardId(Long dashboardId);
}
