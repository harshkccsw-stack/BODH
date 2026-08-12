package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.model.assessment.AssessmentTerms;

/**
 * The consent body is authored in the dashboard and rendered as HTML into
 * respondents' browsers, on an API that has no authentication yet — so the
 * allowlist is a security control, not a formatting nicety. These cases are
 * the ones that would matter if it regressed.
 */
class AssessmentTermsTest {

    @Test
    void acceptsTheMarkupTheEditorProduces() {
        assertThat(AssessmentTerms.validationErrorOf(AssessmentTerms.DEFAULT_HTML)).isNull();
        assertThat(AssessmentTerms.validationErrorOf(
                "<p><b>Bold</b> and <strong>strong</strong> and <i>i</i> and <em>em</em> and <u>u</u></p>"
                        + "<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>"
                        + "<h2>Large</h2><h3>Medium</h3><p>line<br>break</p><p>self<br/>closing</p>"))
                .isNull();
        assertThat(AssessmentTerms.validationErrorOf(null)).isNull();
        assertThat(AssessmentTerms.validationErrorOf("")).isNull();
    }

    @Test
    void rejectsScriptAndOtherMarkup() {
        assertThat(AssessmentTerms.validationErrorOf("<p>hi</p><script>alert(1)</script>"))
                .contains("<script>");
        assertThat(AssessmentTerms.validationErrorOf("<img src=x onerror=alert(1)>"))
                .contains("<img>");
        assertThat(AssessmentTerms.validationErrorOf("<a href=\"javascript:alert(1)\">click</a>"))
                .contains("<a>");
        assertThat(AssessmentTerms.validationErrorOf("<iframe src=\"//evil\"></iframe>"))
                .contains("<iframe>");
        assertThat(AssessmentTerms.validationErrorOf("<!-- <script>alert(1)</script> -->"))
                .isNotNull();
    }

    @Test
    void rejectsAttributesEvenOnAllowedTags() {
        // The strip only matches bare tags, so an attribute-bearing <p> keeps
        // its '<' and trips the check — which is what keeps this a whitelist
        // of spellings rather than an attribute parser.
        assertThat(AssessmentTerms.validationErrorOf("<p onclick=\"alert(1)\">hi</p>")).isNotNull();
        assertThat(AssessmentTerms.validationErrorOf("<p style=\"position:fixed\">hi</p>")).isNotNull();
        assertThat(AssessmentTerms.validationErrorOf("<b class=\"x\">hi</b>")).isNotNull();
    }

    @Test
    void allowsAGreaterThanSignInProse() {
        // Authors type "5 > 3"; browsers render a stray '>' as text, and the
        // editor escapes every '<' they type, so only '<' is dangerous.
        assertThat(AssessmentTerms.validationErrorOf("<p>Scores &gt; 3 pass, 5 > 3 always</p>")).isNull();
    }

    @Test
    void rejectsBodiesOverTheCap() {
        assertThat(AssessmentTerms.validationErrorOf("<p>" + "x".repeat(AssessmentTerms.MAX_LENGTH) + "</p>"))
                .contains("at most");
    }

    @Test
    void treatsEmptyEditorOutputAsBlank() {
        assertThat(AssessmentTerms.isBlank(null)).isTrue();
        assertThat(AssessmentTerms.isBlank("   ")).isTrue();
        assertThat(AssessmentTerms.isBlank("<p><br></p>")).isTrue();
        assertThat(AssessmentTerms.isBlank("<p>&nbsp;</p>")).isTrue();
        assertThat(AssessmentTerms.isBlank("<ul><li></li></ul>")).isTrue();
        assertThat(AssessmentTerms.isBlank("<p>Terms</p>")).isFalse();
    }

    @Test
    void substitutesTheDefaultForAssessmentsWithoutTerms() {
        assertThat(AssessmentTerms.effective(null)).isEqualTo(AssessmentTerms.DEFAULT_HTML);
        assertThat(AssessmentTerms.effective("<p><br></p>")).isEqualTo(AssessmentTerms.DEFAULT_HTML);
        assertThat(AssessmentTerms.effective("<p>Mine</p>")).isEqualTo("<p>Mine</p>");
    }
}
