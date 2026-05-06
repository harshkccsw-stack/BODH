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
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.VerticalDto;
import com.bodhpsychometric.bodhassess.service.VerticalsService;

@RestController
@RequestMapping("/api/v1/verticals")
public class VerticalsController {

    @Autowired
    private VerticalsService service;

    @GetMapping
    public List<VerticalDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public VerticalDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<VerticalDto> create(@RequestBody VerticalDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
