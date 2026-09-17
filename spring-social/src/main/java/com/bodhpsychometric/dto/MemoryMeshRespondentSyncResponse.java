package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.auth.RespondentUser;

/**
 * What the mirror call gets back: which identity the person now holds here.
 *
 * @param created true when THIS call added a respondent profile (a brand-new
 *                identity, or a profile attached to an existing one); false
 *                when the person was already a respondent and nothing new was
 *                written beyond filling blanks
 */
public record MemoryMeshRespondentSyncResponse(
        boolean created,
        Long userId,
        Long respondentUserId,
        String serialId,
        String email) {

    public static MemoryMeshRespondentSyncResponse from(RespondentUser respondent, boolean created) {
        return new MemoryMeshRespondentSyncResponse(
                created,
                respondent.getUser().getId(),
                respondent.getId(),
                respondent.getUser().getSerialId(),
                respondent.getUser().getEmail());
    }
}
