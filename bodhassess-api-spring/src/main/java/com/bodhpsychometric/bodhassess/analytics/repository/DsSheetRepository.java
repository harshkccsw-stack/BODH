package com.bodhpsychometric.bodhassess.analytics.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.analytics.model.DsSheet;

@Repository
public interface DsSheetRepository extends JpaRepository<DsSheet, Long> {

    List<DsSheet> findByWorkbookIdOrderBySortOrderAscIdAsc(Long workbookId);

    void deleteByWorkbookId(Long workbookId);
}
