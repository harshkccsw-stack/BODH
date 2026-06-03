package com.bodhpsychometric.bodhassess.analytics.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbookShare;

@Repository
public interface DsWorkbookShareRepository extends JpaRepository<DsWorkbookShare, Long> {

    List<DsWorkbookShare> findByWorkbookId(Long workbookId);

    Optional<DsWorkbookShare> findByWorkbookIdAndSharedWithUserId(Long workbookId, String sharedWithUserId);

    void deleteByWorkbookId(Long workbookId);
}
