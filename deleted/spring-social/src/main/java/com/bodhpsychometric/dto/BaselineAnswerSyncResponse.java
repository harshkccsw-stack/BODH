package com.bodhpsychometric.dto;

/** @param stored how many answers were written or rewritten by this call */
public record BaselineAnswerSyncResponse(Long respondentUserId, String serialId, int stored) {
}
