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

import com.bodhpsychometric.bodhassess.payload.RoleDto;
import com.bodhpsychometric.bodhassess.service.RolesService;

@RestController
@RequestMapping("/api/v1/roles")
public class RolesController {

    @Autowired
    private RolesService service;

    @GetMapping
    public List<RoleDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public RoleDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<RoleDto> create(@RequestBody RoleDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public RoleDto update(@PathVariable String id, @RequestBody RoleDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
