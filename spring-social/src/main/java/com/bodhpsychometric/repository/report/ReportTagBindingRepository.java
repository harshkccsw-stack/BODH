package com.bodhpsychometric.repository.report;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.report.ReportTagBinding;

public interface ReportTagBindingRepository extends JpaRepository<ReportTagBinding, Long> {

    List<ReportTagBinding> findByTemplateReportTemplateIdOrderBySortOrderAsc(Long reportTemplateId);

    Optional<ReportTagBinding> findByTemplateReportTemplateIdAndTag(Long reportTemplateId, String tag);

    /** Drives the "9 of 14 bound" counter without loading the rows. */
    long countByTemplateReportTemplateIdAndBinderType(Long reportTemplateId, String binderType);
}
