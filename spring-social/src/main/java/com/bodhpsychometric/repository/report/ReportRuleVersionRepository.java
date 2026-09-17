package com.bodhpsychometric.repository.report;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.report.ReportRuleVersion;

public interface ReportRuleVersionRepository extends JpaRepository<ReportRuleVersion, Long> {

    List<ReportRuleVersion> findByRuleReportRuleIdOrderByVersionDesc(Long reportRuleId);
}
