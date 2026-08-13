package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.questionnaire.Section;

/** One section of a questionnaire; sortOrder is its display position (0-based). */
public record SectionResponse(Long sectionId, String name, String instruction, int sortOrder) {

    public static SectionResponse from(Section s) {
        return new SectionResponse(s.getSectionId(), s.getName(), s.getInstruction(), s.getSortOrder());
    }
}
