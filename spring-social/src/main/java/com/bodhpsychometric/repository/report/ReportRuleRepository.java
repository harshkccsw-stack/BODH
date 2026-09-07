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

    /**
     * Every slug in the library, for the reference lint.
     *
     * <p>The whole library, not a lookup of candidate tokens, because the lint
     * needs to tell "this word is not a rule at all" from "this IS a rule and
     * you did not select it" — and only the second is worth warning about.
     * Slugs are short and there are hundreds at most, so one projection query
     * beats an IN clause built from every word somebody typed.
     */
    @Query("select r.slug from ReportRule r")
    List<String> findAllSlugs();

    boolean existsBySlugIgnoreCase(String slug);

    boolean existsBySlugIgnoreCaseAndReportRuleIdNot(String slug, Long reportRuleId);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndReportRuleIdNot(String name, Long reportRuleId);
}
