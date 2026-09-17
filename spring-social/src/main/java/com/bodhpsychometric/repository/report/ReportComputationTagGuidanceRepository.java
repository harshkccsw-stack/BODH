package com.bodhpsychometric.repository.report;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.report.ReportComputationTagGuidance;

public interface ReportComputationTagGuidanceRepository
        extends JpaRepository<ReportComputationTagGuidance, Long> {

    List<ReportComputationTagGuidance>
            findByComputationReportComputationIdOrderBySortOrderAsc(Long reportComputationId);
}
