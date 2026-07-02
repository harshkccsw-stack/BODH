package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.QuestionnaireDto;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireSummaryDto;
import com.bodhpsychometric.bodhassess.service.QuestionnairesService;

@RestController
@RequestMapping("/api/v1/questionnaires")
public class QuestionnairesController {

    @Autowired
    private QuestionnairesService service;

    @GetMapping
    public List<QuestionnaireDto> list(@RequestParam(value = "vertical", required = false) String vertical) {
        return service.list(vertical);
    }

    // Lightweight projection for dropdowns — id, name, vertical, category,
    // duration, itemCount. Skips the question + MQ trees so the
    // assessment-create page doesn't pull the full payload just to render a
    // select list.
    @GetMapping("/summaries")
    public List<QuestionnaireSummaryDto> listSummaries(@RequestParam(value = "vertical", required = false) String vertical) {
        return service.listSummaries(vertical);
    }

    @GetMapping("/by-name")
    public QuestionnaireDto getByName(@RequestParam("name") String name) {
        return service.getByName(name);
    }

    @GetMapping("/{id}")
    public QuestionnaireDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<QuestionnaireDto> upsert(@RequestBody QuestionnaireDto dto) {
        return new ResponseEntity<>(service.upsert(dto), HttpStatus.CREATED);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
