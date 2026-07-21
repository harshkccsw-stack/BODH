package com.bodhpsychometric.dto;

import com.bodhpsychometric.model.questionnaire.Section;

/** One section of a questionnaire; display order is insertion order. */
public record SectionResponse(Long sectionId, String name, String instruction) {

    public static SectionResponse from(Section s) {
        return new SectionResponse(s.getSectionId(), s.getName(), s.getInstruction());
    }
}
