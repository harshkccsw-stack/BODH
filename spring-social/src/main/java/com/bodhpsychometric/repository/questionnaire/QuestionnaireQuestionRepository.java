package com.bodhpsychometric.repository.questionnaire;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;

public interface QuestionnaireQuestionRepository extends JpaRepository<QuestionnaireQuestion, Long> {

    /**
     * DISPLAY ORDER, and the only definition of it — every query below ends
     * with this clause, so the portal, the export sheet and the dashboard
     * cannot disagree about what order a questionnaire's questions are in.
     *
     * Section FIRST, then position. That ordering is load-bearing:
     * QuestionnaireQuestion.sortOrder is per-SECTION (0-based inside each
     * section — see buildMappingEntries in the wizard), so sorting by it
     * alone interleaves the sections, handing the respondent question 1 of
     * every section before question 2 of any of them.
     *
     * Placements with no section sort LAST rather than first: a placement
     * loses its section when that section is deleted (deleteSection detaches
     * instead of cascading), and both the wizard's "unassigned" group and the
     * preview show those after the real sections.
     *
     * s.sectionId is the section tie-break for the same reason SectionRepository
     * uses it — two sections may share a sortOrder only transiently, and the
     * order must still be stable.
     */
    String DISPLAY_ORDER = "order by case when s.sectionId is null then 1 else 0 end asc, "
            + "s.sortOrder asc, s.sectionId asc, "
            + "qq.sortOrder asc, qq.questionnaireQuestionId asc";

    /**
     * Placements of one questionnaire in display order, question fetched.
     * Was findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionnaireQuestionIdAsc,
     * a derived-name method: the section-first order cannot be expressed as a
     * method name, and the interleave it produced was the bug this fixes.
     */
    @Query("select qq from QuestionnaireQuestion qq join fetch qq.question "
            + "left join qq.section s "
            + "where qq.questionnaire.questionnaireId = :questionnaireId " + DISPLAY_ORDER)
    List<QuestionnaireQuestion> findInDisplayOrder(Long questionnaireId);

    /**
     * Portal delivery fetch — question + options + section eagerly, in display
     * order. The section join is aliased so DISPLAY_ORDER can sort by it:
     * writing qq.section.sortOrder in the order-by instead would make Hibernate
     * emit a SECOND, inner join, silently dropping every section-less placement.
     */
    @Query("select qq from QuestionnaireQuestion qq "
            + "join fetch qq.question q left join fetch q.options left join fetch qq.section s "
            + "where qq.questionnaire.questionnaireId = :questionnaireId " + DISPLAY_ORDER)
    List<QuestionnaireQuestion> findForPortalDelivery(Long questionnaireId);

    /**
     * Export columns — placements of a questionnaire in display order with the
     * question fetched (NOT its options, so no row fan-out). questionTag is the
     * column header; question stem/id label it. The section join is likewise a
     * plain join, not a fetch, for the same no-fan-out reason.
     */
    @Query("select qq from QuestionnaireQuestion qq join fetch qq.question "
            + "left join qq.section s "
            + "where qq.questionnaire.questionnaireId = :questionnaireId " + DISPLAY_ORDER)
    List<QuestionnaireQuestion> findForExportColumns(Long questionnaireId);

    /**
     * Which questions this questionnaire places, ids only — the scoring plan's
     * membership check. An answer to a question that has since been unplaced
     * already has no column in the export sheet, so it must not reach a total
     * either.
     */
    @Query("select qq.question.questionId from QuestionnaireQuestion qq "
            + "where qq.questionnaire.questionnaireId = :questionnaireId")
    List<Long> findPlacedQuestionIds(Long questionnaireId);

    List<QuestionnaireQuestion> findByQuestionQuestionId(Long questionId);

    List<QuestionnaireQuestion> findBySectionSectionId(Long sectionId);

    void deleteByQuestionnaireQuestionnaireId(Long questionnaireId);

    long countByQuestionnaireQuestionnaireId(Long questionnaireId);

    boolean existsByQuestionQuestionId(Long questionId);
}
