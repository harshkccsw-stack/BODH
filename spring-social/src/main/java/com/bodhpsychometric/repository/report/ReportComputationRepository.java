package com.bodhpsychometric.repository.report;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.report.ReportComputation;

public interface ReportComputationRepository extends JpaRepository<ReportComputation, Long> {

    @Query("""
            select distinct c from ReportComputation c
            left join fetch c.rules
            order by c.updatedAt desc
            """)
    List<ReportComputation> findAllWithRules();

    /**
     * One computation with everything the draft screen and the prompt
     * assembler need. Two collections cannot be fetch-joined in one query
     * without a cartesian product, so the second is loaded by its own finder.
     */
    @Query("""
            select c from ReportComputation c
            left join fetch c.rules rules
            left join fetch rules.ruleVersion rv
            left join fetch rv.rule
            where c.reportComputationId = :id
            """)
    Optional<ReportComputation> findByIdWithRules(@Param("id") Long id);

    boolean existsBySlugIgnoreCase(String slug);

    boolean existsBySlugIgnoreCaseAndReportComputationIdNot(String slug, Long id);

    /** Pre-check behind "this rule version is in use" — a 409, not an FK error. */
    @Query("""
            select count(l) from ReportComputationRule l
            where l.ruleVersion.rule.reportRuleId = :ruleId
            """)
    long countUsagesOfRule(@Param("ruleId") Long ruleId);

    /** Templates cannot be deleted while a computation points at them. */
    long countByTemplateReportTemplateId(Long reportTemplateId);
}
