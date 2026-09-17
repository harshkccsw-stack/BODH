package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.report.TemplateTagParser;

class TemplateTagParserTest {

    private final TemplateTagParser parser = new TemplateTagParser();

    @Test
    void findsTagsInDocumentOrderAndDeduplicates() {
        String html = "<p>${name}</p><p>${org}</p><footer>${name}</footer>";
        assertThat(parser.parse(html)).containsExactly("name", "org");
    }

    @Test
    void aTagUsedTwiceIsOneChecklistItem() {
        // The reconcile is keyed on the tag, so a repeated tag must collapse
        // or the "n of m bound" counter double-counts it.
        assertThat(parser.parse("${a} ${a} ${a}")).hasSize(1);
    }

    @Test
    void ignoresThingsThatAreNotTags() {
        assertThat(parser.parse("<style>a{color:red}</style> {notATag} $ {} ${}"))
                .isEmpty();
    }

    @Test
    void acceptsDotsUnderscoresAndHyphens() {
        assertThat(parser.parse("${core.name} ${core_name} ${core-name}"))
                .containsExactly("core.name", "core_name", "core-name");
    }

    @Test
    void doubledDollarEscapesATag() {
        assertThat(parser.parse("$${notATag}")).isEmpty();
    }

    @Test
    void substitutesValuesAndUnescapesTheEscape() {
        String out = parser.substitute("Hi ${name}, see $${literal}",
                Map.of("name", "Priya"));
        assertThat(out).isEqualTo("Hi Priya, see ${literal}");
    }

    @Test
    void aMissingValueRendersEmptyRatherThanLeavingThePlaceholderVisible() {
        // Printing "${name}" to a client is the worse of the two failures.
        assertThat(parser.substitute("[${gone}]", Map.of())).isEqualTo("[]");
    }

    @Test
    void aValueContainingDollarOrBackslashDoesNotCorruptTheOutput() {
        // Matcher.appendReplacement treats $ and \ as syntax. Without
        // quoteReplacement this throws or silently mangles the name.
        String out = parser.substitute("${name}", Map.of("name", "A$1 \\ B"));
        assertThat(out).isEqualTo("A$1 \\ B");
    }

    @Test
    void emptyHtmlIsAnEmptyListNotAnError() {
        assertThat(parser.parse(null)).isEmpty();
        assertThat(parser.parse("")).isEmpty();
    }

    @Test
    void tagsLongerThanTheColumnAreNotMatched() {
        String tooLong = "x".repeat(TemplateTagParser.MAX_TAG_LENGTH + 1);
        assertThat(parser.parse("${" + tooLong + "}")).isEmpty();
    }

    @Test
    void substituteLeavesHtmlUntouchedWhenThereAreNoTags() {
        String html = "<p>plain</p>";
        assertThat(parser.substitute(html, Map.<String, String>of())).isEqualTo(html);
    }

    @Test
    void parsesTagsInsideSvgAndAttributes() {
        List<String> tags = parser.parse(
                "<svg><text font-family=\"X\">${score}</text></svg><img alt=\"${alt}\"/>");
        assertThat(tags).containsExactly("score", "alt");
    }
}
