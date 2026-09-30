package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

/**
 * Name rules of the taxonomy (2026-09-30): ONE measured quality per name,
 * ignoring case, on create and on rename; a measured quality type may share
 * its name with a type under another MQ or another parent, but not with a
 * SIBLING — the roots of one MQ or the children of one type.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TaxonomyNameRulesTest {

    @Autowired
    private MockMvc mvc;

    private ResultActions postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private int mq(String name) throws Exception {
        String body = postJson("/api/qualities/create", "{\"name\":\"" + name + "\",\"description\":null}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.measuredQualityId");
    }

    private ResultActions mqt(String anchor, String name) throws Exception {
        return postJson("/api/quality-types/create", "{" + anchor + ",\"name\":\"" + name + "\"}");
    }

    private int id(ResultActions created) throws Exception {
        return JsonPath.read(created.andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.measuredQualityTypeId");
    }

    @Test
    void aMeasuredQualityNameIsUniqueIgnoringCase() throws Exception {
        int drive = mq("__smoke__Names Drive");
        int other = mq("__smoke__Names Other");

        postJson("/api/qualities/create", "{\"name\":\"  __SMOKE__names drive \",\"description\":null}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("already exists")));

        // Renaming into another MQ's name is refused; keeping your own is not.
        mvc.perform(put("/api/qualities/update/" + other).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__names DRIVE\",\"description\":null}"))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/qualities/update/" + drive).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__Names Drive\",\"description\":\"same name, new text\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void aTypeNameRepeatsAcrossParentsButNotAmongSiblings() throws Exception {
        int first = mq("__smoke__Names First");
        int second = mq("__smoke__Names Second");

        int attention = id(mqt("\"measuredQualityId\":" + first, "Attention"));
        // Same name under ANOTHER MQ: allowed.
        id(mqt("\"measuredQualityId\":" + second, "Attention"));
        // Same name as a root sibling, any case: refused.
        mqt("\"measuredQualityId\":" + first, " attention ")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("already has a type")));

        // Children: same name under a different parent is fine, twice under one is not.
        id(mqt("\"parentTypeId\":" + attention, "Focus"));
        mqt("\"parentTypeId\":" + attention, "FOCUS").andExpect(status().isConflict());
        int memory = id(mqt("\"measuredQualityId\":" + first, "Memory"));
        int memoryFocus = id(mqt("\"parentTypeId\":" + memory, "Focus"));

        // Rename into a sibling's name is refused; into your own is not.
        mvc.perform(put("/api/quality-types/update/" + memory).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Attention\"}"))
                .andExpect(status().isConflict());
        mvc.perform(put("/api/quality-types/update/" + memoryFocus).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"focus\"}"))
                .andExpect(status().isOk());
    }
}
