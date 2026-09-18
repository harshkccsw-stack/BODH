package com.bodhpsychometric.dto;

import java.time.LocalDate;

import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.auth.enums.Gender;

/**
 * The verified person, with everything MemoryMesh needs to create its own
 * copy: its identity minimum is name, email, phone pair, dob, gender. dob is
 * returned because the caller already proved they know it.
 */
public record MemoryMeshAuthVerifyResponse(
        Long userId,
        Long respondentUserId,
        String serialId,
        String name,
        String email,
        String phoneCountryCode,
        String phone,
        LocalDate dob,
        Gender gender) {

    public static MemoryMeshAuthVerifyResponse from(RespondentUser respondent) {
        User user = respondent.getUser();
        return new MemoryMeshAuthVerifyResponse(
                user.getId(), respondent.getId(), user.getSerialId(),
                respondent.getName(), user.getEmail(),
                respondent.getPhoneCountryCode(), respondent.getPhone(),
                user.getDob(), respondent.getGender());
    }
}
