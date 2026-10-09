package com.bodhpsychometric.service.questionnaire;

import java.util.ArrayList;
import java.util.List;

import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.questionnaire.Section;

/**
 * Stamps placements with their questionnaire-local report tags
 * ("Section_A_Q_1" / "Q_1") — the identifiers the export sheet and Data
 * Studio columns are keyed by. One home, because TWO writers need it now:
 * QuestionnaireController's placement PUT (the original), and the question
 * flow's group-membership sync (V49), which inserts and removes member
 * placements when a group gains or loses a question.
 */
public final class PlacementTags {

    private PlacementTags() {
    }

    /**
     * Sectioned: sections that actually hold questions are lettered A, B, …
     * in display order (the author's sortOrder — empty sections never
     * render, so they claim no letter), and questions count 1..n inside
     * their section by sortOrder. Flat: Q_1..Q_n across the questionnaire.
     */
    public static void assign(boolean hasSections, List<Section> sectionsInDisplayOrder,
            List<QuestionnaireQuestion> rows) {
        if (!hasSections) {
            List<QuestionnaireQuestion> ordered = new ArrayList<>(rows);
            ordered.sort(java.util.Comparator.comparingInt(QuestionnaireQuestion::getSortOrder));
            for (int i = 0; i < ordered.size(); i++) {
                ordered.get(i).setQuestionTag("Q_" + (i + 1));
            }
            return;
        }
        int letterIndex = 0;
        for (Section section : sectionsInDisplayOrder) {
            List<QuestionnaireQuestion> inSection = rows.stream()
                    .filter(r -> r.getSection() != null
                            && r.getSection().getSectionId().equals(section.getSectionId()))
                    .sorted(java.util.Comparator.comparingInt(QuestionnaireQuestion::getSortOrder))
                    .toList();
            if (inSection.isEmpty()) {
                continue;
            }
            String letter = sectionLetter(letterIndex++);
            for (int i = 0; i < inSection.size(); i++) {
                inSection.get(i).setQuestionTag("Section_" + letter + "_Q_" + (i + 1));
            }
        }
    }

    /** 0 → A … 25 → Z, 26 → AA — spreadsheet-style, should a questionnaire ever exceed 26 sections. */
    public static String sectionLetter(int index) {
        StringBuilder sb = new StringBuilder();
        for (int n = index; n >= 0; n = n / 26 - 1) {
            sb.insert(0, (char) ('A' + n % 26));
        }
        return sb.toString();
    }
}
