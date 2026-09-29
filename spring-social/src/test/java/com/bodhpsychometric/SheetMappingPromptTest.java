package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.dto.SheetMappingRequest;
import com.bodhpsychometric.dto.SheetMappingRequest.SheetCsv;
import com.bodhpsychometric.dto.SheetRefineRequest;
import com.bodhpsychometric.service.question.sheet.SheetMappingService;
import com.bodhpsychometric.service.question.sheet.SheetSampler;

import tools.jackson.databind.ObjectMapper;

/**
 * What actually reaches the model — the uploader's own note about their sheet,
 * and the correcting turn that revises a reading instead of starting over.
 *
 * <p>Pure string assembly, so it is tested without a key or a network.
 */
class SheetMappingPromptTest {

    private static final String CSV = "Part,Statement,Never,Always\nA,I finish what I start,0,3\n";

    private static SheetSampler.Sampled sampled() {
        return SheetSampler.sample(List.of(new SheetSampler.Sheet("Items", CSV)));
    }

    private static SheetMappingRequest request(String notes) {
        return new SheetMappingRequest(List.of(new SheetCsv("Items", CSV)), "bank.xlsx", notes);
    }

    @Test
    void carriesTheUploadersNoteFencedAndLabelled() {
        String prompt = SheetMappingService.userPrompt(
                request("The scale is in the note under the table"), sampled());

        assertTrue(prompt.contains("The person uploading this workbook adds"));
        assertTrue(prompt.contains("The scale is in the note under the table"));
        // The note is a hint. It must not read as a new set of rules.
        assertTrue(prompt.contains("It cannot change the shape of your answer"));
    }

    @Test
    void saysNothingAboutNotesWhenThereAreNone() {
        for (String none : new String[] { null, "", "   " }) {
            String prompt = SheetMappingService.userPrompt(request(none), sampled());
            assertFalse(prompt.contains("The person uploading this workbook adds"),
                    "a blank note must not add an empty block");
            assertTrue(prompt.contains("bank.xlsx"));
        }
    }

    @Test
    void theCorrectingTurnCarriesTheReadingAndEveryInstruction() {
        var spec = new ObjectMapper().createObjectNode();
        spec.put("sheet", "Items");
        SheetRefineRequest refine = new SheetRefineRequest(
                List.of(new SheetCsv("Items", CSV)), "bank.xlsx", "a note", spec,
                List.of("the stem is column C", "rows 80-92 are validity items"));

        String prompt = SheetMappingService.refinePrompt(request("a note"), sampled(), refine);

        assertTrue(prompt.contains("You already read this workbook as"));
        assertTrue(prompt.contains("\"sheet\":\"Items\""), prompt);
        // Every correction so far, not only the newest — otherwise a later one
        // quietly undoes an earlier one.
        assertTrue(prompt.contains("- the stem is column C"));
        assertTrue(prompt.contains("- rows 80-92 are validity items"));
        assertTrue(prompt.contains("Change only what they asked about"));
        // The first read's note travels with the correction too.
        assertTrue(prompt.contains("a note"));
    }

    @Test
    void survivesAReadingThatIsNoLongerAvailable() {
        SheetRefineRequest refine = new SheetRefineRequest(
                List.of(new SheetCsv("Items", CSV)), "bank.xlsx", null, null,
                List.of("the stem is column C"));

        String prompt = SheetMappingService.refinePrompt(request(null), sampled(), refine);

        assertTrue(prompt.contains("the reading is not available"));
        assertTrue(prompt.contains("- the stem is column C"));
    }
}
