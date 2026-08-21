package com.bodhpsychometric.repository.datastudio;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.datastudio.DsWorkbook;

public interface DsWorkbookRepository extends JpaRepository<DsWorkbook, Long> {

    /**
     * The gallery for one user: everything they own plus everything shared
     * with them, newest first. One query rather than two lists merged in Java,
     * so a workbook that is both (impossible today, but a self-share is only a
     * bug away) still appears once — {@code distinct} carries that.
     */
    @Query("select distinct w from DsWorkbook w join fetch w.owner "
            + "where w.owner.id = :userId "
            + "or exists (select 1 from DsWorkbookShare s "
            + "           where s.workbook = w and s.sharedWith.id = :userId) "
            + "order by w.updatedAt desc, w.dsWorkbookId desc")
    List<DsWorkbook> findVisibleTo(Long userId);

    /** Super-admin gallery: every workbook, owner fetched for the DTO. */
    @Query("select w from DsWorkbook w join fetch w.owner "
            + "order by w.updatedAt desc, w.dsWorkbookId desc")
    List<DsWorkbook> findAllForGallery();
}
