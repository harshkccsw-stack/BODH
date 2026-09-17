package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ReportRuleRequest;
import com.bodhpsychometric.dto.ReportRuleResponse;
import com.bodhpsychometric.dto.ScoringSheetImportRequest;
import com.bodhpsychometric.dto.ScoringSheetPreviewResponse;
import com.bodhpsychometric.dto.ScoringSheetPreviewResponse.DraftRule;
import com.bodhpsychometric.dto.ScoringSheetPreviewResponse.SelectionGroup;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.repository.report.ReportRuleRepository;

/**
 * Turns a parsed workbook into rules.
 *
 * <p>Every rule is created as a {@code STATEMENT} holding the sheet's own
 * words. That is the point of this step and not a limitation of it: a statement
 * is filed, searchable and reviewable but never evaluated, so an import cannot
 * put a wrong number in a report. Making them runnable is a separate decision
 * taken per rule, with the original text kept beside the formula for as long as
 * the rule exists.
 */
@Service
public class ScoringSheetImportService {

    @Autowired private ScoringSheetParser parser;
    @Autowired private ReportRuleService ruleService;
    @Autowired private ReportRuleRepository rules;
    @Autowired private ReportAccess access;

    /* ===================== preview ===================== */

    public ScoringSheetPreviewResponse preview(ScoringSheetImportRequest request) {
        // Authoring, not browsing: the preview reads every existing rule name
        // in order to report clashes, so it must not answer an anonymous
        // caller merely because it happens to write nothing.
        access.requireAuthor();
        ScoringSheetParser.ParsedSheet sheet = parser.parse(request.csv());

        Set<String> takenNames = new LinkedHashSet<>();
        for (ReportRule existing : rules.findAll()) {
            takenNames.add(existing.getName().toLowerCase(Locale.ROOT));
        }

        List<DraftRule> drafts = new ArrayList<>();
        List<String> blocking = new ArrayList<>(sheet.blocking());
        for (ScoringSheetParser.ParsedRule rule : sheet.rules()) {
            boolean taken = takenNames.contains(rule.name().toLowerCase(Locale.ROOT));
            if (taken) {
                blocking.add("Row " + rule.sheetRow() + ": a rule called \"" + rule.name()
                        + "\" already exists. Rename it in the sheet, or archive the existing one.");
            }
            drafts.add(new DraftRule(
                    rule.sheetRow(), rule.code(), rule.name(), slugOf(rule.name()),
                    rule.stage(), rule.stepOrder(), rule.logicText(), rule.writesTo(), taken));
        }

        return new ScoringSheetPreviewResponse(
                drafts, sheet.warnings(), blocking, groupsOf(sheet.rules()));
    }

    /**
     * Rules that fill the same placeholder, in sheet order.
     *
     * <p>Sheet order is load-bearing: it becomes the priority order offered in
     * the wizard, and {@code FIRST()} answers with the first candidate that
     * produced text. A group of one is not a choice and is left out.
     */
    static List<SelectionGroup> groupsOf(List<ScoringSheetParser.ParsedRule> parsed) {
        Map<String, List<ScoringSheetParser.ParsedRule>> byTarget = new LinkedHashMap<>();
        for (ScoringSheetParser.ParsedRule rule : parsed) {
            if (rule.writesTo() == null || rule.writesTo().isBlank()) {
                continue;
            }
            byTarget.computeIfAbsent(
                    rule.stage() + " " + rule.writesTo().toLowerCase(Locale.ROOT),
                    key -> new ArrayList<>()).add(rule);
        }
        List<SelectionGroup> groups = new ArrayList<>();
        byTarget.forEach((key, members) -> {
            if (members.size() < 2) {
                return;
            }
            groups.add(new SelectionGroup(
                    members.get(0).writesTo(),
                    members.get(0).stage(),
                    members.stream().map(ScoringSheetParser.ParsedRule::name).toList()));
        });
        return groups;
    }

    /* ===================== import ===================== */

    /**
     * All or nothing.
     *
     * <p>Everything is checked before anything is written, in the house style,
     * because a loop that returns halfway still COMMITS what it already saved -
     * leaving a practitioner with eleven of twenty-two rules and no way to tell
     * which eleven without reading the sheet against the screen.
     */
    @Transactional
    public List<ReportRuleResponse> importAll(ScoringSheetImportRequest request) {
        ScoringSheetPreviewResponse preview = preview(request);
        if (!preview.blocking().isEmpty()) {
            throw new IllegalStateException(preview.blocking().get(0));
        }

        List<ReportRuleResponse> created = new ArrayList<>();
        for (DraftRule draft : preview.rules()) {
            created.add(ruleService.create(new ReportRuleRequest(
                    draft.name(),
                    null,                       // slug derives from the name
                    null,                       // description
                    ReportRuleVersion.KIND_STATEMENT,
                    null,                       // no expression - nothing runnable yet
                    draft.logicText(),
                    null,                       // result type is unknown until translated
                    request.assessmentId(),
                    request.organizationId(),
                    draft.stage(),
                    draft.stepOrder(),
                    provenance(draft))));
        }
        return created;
    }

    /**
     * The sheet's own words, kept for the life of the rule.
     *
     * <p>Redundant with {@code statementText} today and deliberately so: the
     * moment a rule is translated into an expression its statement text is
     * gone, and the original wording is then the only thing that can answer
     * "why does this formula say 34?" a year later - or be re-translated when
     * the first attempt turns out to have been wrong.
     */
    private static String provenance(DraftRule draft) {
        return "Imported from scoring sheet, row " + draft.sheetRow() + "."
                + (draft.writesTo() == null ? "" : " Sets " + draft.writesTo() + ".")
                + System.lineSeparator() + System.lineSeparator()
                + "Sheet text: " + draft.logicText();
    }

    /** Mirrors ReportRuleService.slugFor so the preview shows the real slug. */
    private static String slugOf(String name) {
        String slug = name.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return slug.length() > 80 ? slug.substring(0, 80) : slug;
    }
}
