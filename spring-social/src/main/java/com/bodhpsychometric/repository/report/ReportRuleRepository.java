package com.bodhpsychometric.repository.report;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.report.ReportRule;

public interface ReportRuleRepository extends JpaRepository<ReportRule, Long> {

    /**
     * The library list. Versions are fetched with it because every row shows
     * the latest definition and its version number, and doing that lazily is a
     * query per rule.
     */
    @Query("""
            select distinct r from ReportRule r
            left join fetch r.versions
            order by r.updatedAt desc
            """)
    List<ReportRule> findAllWithVersions();

    @Query("""
            select r from ReportRule r
            left join fetch r.versions
            where r.reportRuleId = :id
            """)
    Optional<ReportRule> findByIdWithVersions(@Param("id") Long id);

    boolean existsBySlugIgnoreCase(String slug);

    boolean existsBySlugIgnoreCaseAndReportRuleIdNot(String slug, Long reportRuleId);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndReportRuleIdNot(String name, Long reportRuleId);
}
