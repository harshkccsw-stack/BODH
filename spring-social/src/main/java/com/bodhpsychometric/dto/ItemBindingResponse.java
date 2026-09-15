package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.report.ReportItemBinding;

/** One stored binding. */
public record ItemBindingResponse(
        Long reportItemBindingId,
        Long assessmentId,
        String itemCode,
        Integer adminPosition,
        String factor,
        String construct,
        String statement,
        boolean reverseScored,
        boolean inComposite,
        Long questionId,
        String questionTag,
        Long mqId,
        Long mqtId,
        String matchMethod) {

    public static ItemBindingResponse from(ReportItemBinding binding) {
        return new ItemBindingResponse(
                binding.getReportItemBindingId(),
                binding.getAssessmentId(),
                binding.getItemCode(),
                binding.getAdminPosition(),
                binding.getFactorLabel(),
                binding.getConstructLabel(),
                binding.getStatement(),
                binding.isReverseScored(),
                binding.isInComposite(),
                binding.getQuestionId(),
                binding.getQuestionTag(),
                binding.getMqId(),
                binding.getMqtId(),
                binding.getMatchMethod());
    }
}
