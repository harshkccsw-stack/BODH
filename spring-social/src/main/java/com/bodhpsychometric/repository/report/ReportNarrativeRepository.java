package com.bodhpsychometric.repository.report;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.report.ReportNarrative;

public interface ReportNarrativeRepository extends JpaRepository<ReportNarrative, Long> {

    /**
     * Every narrative already written for one respondent under one computation.
     *
     * <p>Fetched as a batch per respondent rather than one query per tag: a
     * report with six narrative tags would otherwise open six round trips per
     * person, times the whole cohort.
     */
    List<ReportNarrative> findByComputationReportComputationIdAndRespondentAssessmentMappingId(
            Long reportComputationId, Long respondentAssessmentMappingId);

    List<ReportNarrative> findByComputationReportComputationId(Long reportComputationId);

    /**
     * Throw away every stored narrative for a computation, so the next render
     * writes them again.
     *
     * <p>The fingerprint already invalidates a row whose guidance or scores
     * moved. This is the blunt version, for the case the fingerprint cannot
     * see: somebody simply did not like the writing and wants another pass.
     */
    @Modifying
    @Query("delete from ReportNarrative n where n.computation.reportComputationId = :id")
    int deleteByComputationId(@Param("id") Long id);
}
