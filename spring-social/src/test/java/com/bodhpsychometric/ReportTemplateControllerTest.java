package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * P1 end to end: create a template, watch its tags become a checklist, answer
 * them, publish, render.
 *
 * <p>Everything here works with no rules, no generated code and no AI — which
 * is the point of shipping P1 first.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportTemplateControllerTest {

    @Autowired
    private MockMvc mvc;

    private static final String CLEAN_HEAD = """
            <html><head><meta charset="utf-8"/><style>\
            @page{ @bottom-center{ content: counter(page); \
            font-family: "Noto Sans Devanagari"; } }\
            body{ font-family: "Noto Sans Devanagari"; }\
            </style></head><body>""";

    private String token() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String createTemplate(String name, String bodyHtml) throws Exception {
        String html = (CLEAN_HEAD + bodyHtml + "</body></html>")
                .replace("\\", "\\\\").replace("\"", "\\\"");
        String json = "{\"name\":\"" + name + "\",\"html\":\"" + html + "\"}";
        return mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private static Long idOf(String json) {
        return Long.valueOf(json.replaceAll(".*\"reportTemplateId\"\\s*:\\s*(\\d+).*", "$1"));
    }

    // ── access ────────────────────────────────────────────────────────────

    @Test
    void anonymousIsRefusedEvenWhileTheGlobalFlagIsOff() throws Exception {
        // Reports are the most sensitive artifact in the product, so
        // ReportAccess rejects anonymous itself rather than waiting for
        // app.security.require-auth to be turned on.
        mvc.perform(get("/api/report-templates/getAll"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // ── the tag checklist ─────────────────────────────────────────────────

    @Test
    void savingATemplateTurnsItsTagsIntoAChecklist() throws Exception {
        String body = createTemplate("__smoke__ checklist",
                "<h1>${heading}</h1><p>${name}</p><p>${name} again</p>");

        // Three occurrences, two tags: a repeat is one checklist item.
        org.assertj.core.api.Assertions.assertThat(body).contains("\"tagCount\":2");
        org.assertj.core.api.Assertions.assertThat(body).contains("\"boundCount\":0");
        org.assertj.core.api.Assertions.assertThat(body).contains("\"UNBOUND\"");
    }

    @Test
    void editingTheHtmlAddsAndRemovesTagsButKeepsAnswers() throws Exception {
        String created = createTemplate("__smoke__ reconcile", "<p>${keep}</p><p>${drop}</p>");
        Long id = idOf(created);
        String auth = "Bearer " + token();

        mvc.perform(put("/api/report-templates/bindTag/" + id + "/keep")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"LITERAL\",\"literalText\":\"Kept\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.boundCount").value(1));

        // Rewrite the HTML: drop one tag, add another.
        String html = (CLEAN_HEAD + "<p>${keep}</p><p>${added}</p></body></html>")
                .replace("\\", "\\\\").replace("\"", "\\\"");
        mvc.perform(put("/api/report-templates/update/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ reconcile\",\"html\":\"" + html + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tagCount").value(2))
                // The answer for `keep` survived the edit; `added` is unbound.
                .andExpect(jsonPath("$.boundCount").value(1));

        mvc.perform(delete("/api/report-templates/delete/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isNoContent());
    }

    // ── binding validation ────────────────────────────────────────────────

    @Test
    void bindingAnUnknownTagIs404() throws Exception {
        Long id = idOf(createTemplate("__smoke__ 404", "<p>${real}</p>"));
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/notThere")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"LITERAL\",\"literalText\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void anUnknownCoreFieldIs400() throws Exception {
        Long id = idOf(createTemplate("__smoke__ badcore", "<p>${x}</p>"));
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/x")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"CORE\",\"coreField\":\"core:salary\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aBinderTypeThatNeedsTheScoringEngineIsRefusedWithAnExplanation() throws Exception {
        Long id = idOf(createTemplate("__smoke__ notyet", "<p>${x}</p>"));
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/x")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"VALUE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aDuplicateNameIs409() throws Exception {
        createTemplate("__smoke__ dup", "<p>a</p>");
        String html = (CLEAN_HEAD + "<p>b</p></body></html>").replace("\"", "\\\"");
        mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ dup\",\"html\":\"" + html + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aBlankNameIs400FromBeanValidation() throws Exception {
        mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"html\":\"<p>x</p>\"}"))
                .andExpect(status().isBadRequest());
    }

    // ── publish ───────────────────────────────────────────────────────────

    @Test
    void publishingWithUnansweredTagsIs409AndNamesThem() throws Exception {
        Long id = idOf(createTemplate("__smoke__ unbound", "<p>${stillOpen}</p>"));
        mvc.perform(post("/api/report-templates/publish/" + id)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("stillOpen")));
    }

    @Test
    void publishingATemplateThatWouldRenderWronglyIs409() throws Exception {
        // An SVG <text> with no font-family: charts silently lose the embedded
        // face and non-Latin labels become boxes. Found by the P0a spike.
        Long id = idOf(createTemplate("__smoke__ lint",
                "<svg><text x='1' y='2'>सजगता</text></svg>"));
        mvc.perform(post("/api/report-templates/publish/" + id)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("font-family")));
    }

    @Test
    void aPublishedTemplateCannotBeEdited() throws Exception {
        Long id = idOf(createTemplate("__smoke__ frozen", "<p>${who}</p>"));
        String auth = "Bearer " + token();

        mvc.perform(put("/api/report-templates/bindTag/" + id + "/who")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/report-templates/publish/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));

        String html = (CLEAN_HEAD + "<p>${who}</p></body></html>").replace("\"", "\\\"");
        mvc.perform(put("/api/report-templates/update/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ frozen\",\"html\":\"" + html + "\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void aPublishedTemplateIsEditedByOpeningANewVersionThatKeepsItsAnswers() throws Exception {
        Long id = idOf(createTemplate("__smoke__ newversion", "<p>${who}</p><p>${note}</p>"));
        String auth = "Bearer " + token();

        mvc.perform(put("/api/report-templates/bindTag/" + id + "/who")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}"))
                .andExpect(status().isOk());
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/note")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"LITERAL\",\"literalText\":\"Kept text\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/report-templates/publish/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk());

        // Without this endpoint a published template is a dead end: it refuses
        // edits and nothing else can produce version 2.
        mvc.perform(post("/api/report-templates/newVersion/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.tagCount").value(2))
                // The answers came across — nobody re-answers two tags to fix
                // a typo, they would edit the live one instead.
                .andExpect(jsonPath("$.boundCount").value(2));
    }

    @Test
    void theOriginalStaysPublishedAfterANewVersionIsOpened() throws Exception {
        Long id = idOf(createTemplate("__smoke__ original kept", "<p>${who}</p>"));
        String auth = "Bearer " + token();
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/who")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/report-templates/publish/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk());
        mvc.perform(post("/api/report-templates/newVersion/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk());

        // Reports already delivered from v1 must keep meaning what they said.
        mvc.perform(get("/api/report-templates/getById/" + id)
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.version").value(1));
    }

    // ── render ────────────────────────────────────────────────────────────

    @Test
    void previewRendersARealPdfWithTheBoundValuesInIt() throws Exception {
        Long id = idOf(createTemplate("__smoke__ preview",
                "<h1>${title}</h1><p>Name: ${who}</p>"));
        String auth = "Bearer " + token();

        mvc.perform(put("/api/report-templates/bindTag/" + id + "/title")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"LITERAL\",\"literalText\":\"Counselling Report\"}"))
                .andExpect(status().isOk());
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/who")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}"))
                .andExpect(status().isOk());

        byte[] pdf = mvc.perform(get("/api/report-templates/preview/" + id + ".pdf")
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andReturn().getResponse().getContentAsByteArray();

        org.assertj.core.api.Assertions.assertThat(pdf).isNotEmpty();
        org.assertj.core.api.Assertions.assertThat(new String(pdf, 0, 5)).isEqualTo("%PDF-");

        try (var doc = org.apache.pdfbox.pdmodel.PDDocument.load(pdf)) {
            String text = new org.apache.pdfbox.text.PDFTextStripper().getText(doc);
            org.assertj.core.api.Assertions.assertThat(text).contains("Counselling Report");
            // The sample respondent's name is Devanagari on purpose, so a
            // preview reproduces the font problem rather than hiding it.
            org.assertj.core.api.Assertions.assertThat(text).contains("प्रिया शर्मा");
        }
    }

    @Test
    void theSameTemplateAlsoServesAsAnInteractivePage() throws Exception {
        Long id = idOf(createTemplate("__smoke__ interactive", "<p>${who}</p>"));
        String auth = "Bearer " + token();
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/who")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/report-templates/preview/" + id + ".html")
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(content().string(
                        org.hamcrest.Matchers.containsString("प्रिया शर्मा")));
    }

    @Test
    void aValueContainingMarkupIsEscapedNotRendered() throws Exception {
        Long id = idOf(createTemplate("__smoke__ escape", "<p>${danger}</p>"));
        String auth = "Bearer " + token();
        mvc.perform(put("/api/report-templates/bindTag/" + id + "/danger")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"LITERAL\",\"literalText\":\"<b>bold</b>\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/report-templates/preview/" + id + ".html")
                        .header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("&lt;b&gt;")))
                .andExpect(content().string(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("<b>bold</b>"))));
    }

    @Test
    void theCoreFieldListIsServedSoTheUiNeverHardcodesIt() throws Exception {
        mvc.perform(get("/api/report-templates/coreFields")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$['core:name']").value("Respondent name"))
                // No sitting date is offered: the attempt carries no timestamp,
                // so there is no honest value for it.
                .andExpect(jsonPath("$['core:assessmentDate']").doesNotExist());
    }

    @Test
    void gettingATemplateThatDoesNotExistIs404() throws Exception {
        mvc.perform(get("/api/report-templates/getById/999999")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }
}
