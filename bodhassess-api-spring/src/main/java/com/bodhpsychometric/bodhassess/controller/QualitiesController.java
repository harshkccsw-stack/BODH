package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.QualityDto;
import com.bodhpsychometric.bodhassess.service.QualitiesService;

@RestController
@RequestMapping("/api/v1/qualities")
public class QualitiesController {

    @Autowired
    private QualitiesService service;

    @GetMapping
    public List<QualityDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public QualityDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<QualityDto> create(@RequestBody QualityDto dto) {
        return new ResponseEntity<>(service.upsert(dto), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public QualityDto update(@PathVariable String id, @RequestBody QualityDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
