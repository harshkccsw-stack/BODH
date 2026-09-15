package com.bodhpsychometric.repository.report;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.report.ReportItemBinding;

public interface ReportItemBindingRepository extends JpaRepository<ReportItemBinding, Long> {

    /** Every binding for one assessment, in the order the sheet presented them. */
    List<ReportItemBinding> findByAssessmentIdOrderByAdminPositionAscItemCodeAsc(Long assessmentId);

    List<ReportItemBinding> findByAssessmentId(Long assessmentId);
}
