package com.bodhpsychometric.bodhassess.analytics.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.analytics.model.DsDashboard;

@Repository
public interface DsDashboardRepository extends JpaRepository<DsDashboard, Long> {

    List<DsDashboard> findByWorkbookIdOrderBySortOrderAscIdAsc(Long workbookId);

    void deleteByWorkbookId(Long workbookId);
}
