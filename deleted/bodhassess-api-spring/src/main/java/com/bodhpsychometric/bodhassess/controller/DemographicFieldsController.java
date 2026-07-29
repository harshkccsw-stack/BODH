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

import com.bodhpsychometric.bodhassess.payload.DemographicFieldDto;
import com.bodhpsychometric.bodhassess.service.DemographicFieldsService;

@RestController
@RequestMapping("/api/v1/demographic-fields")
public class DemographicFieldsController {

    @Autowired
    private DemographicFieldsService service;

    @GetMapping
    public List<DemographicFieldDto> list(@RequestParam(value = "active", required = false) String active) {
        return service.list("true".equalsIgnoreCase(active));
    }

    @PostMapping
    public ResponseEntity<DemographicFieldDto> upsert(@RequestBody DemographicFieldDto dto) {
        return new ResponseEntity<>(service.upsert(dto), HttpStatus.CREATED);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
