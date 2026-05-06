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

import com.bodhpsychometric.bodhassess.payload.GroupDto;
import com.bodhpsychometric.bodhassess.service.GroupsService;

@RestController
@RequestMapping("/api/v1/groups")
public class GroupsController {

    @Autowired
    private GroupsService service;

    @GetMapping
    public List<GroupDto> list() { return service.list(); }

    @GetMapping("/{id}")
    public GroupDto get(@PathVariable String id) { return service.get(id); }

    @PostMapping
    public ResponseEntity<GroupDto> create(@RequestBody GroupDto dto) {
        return new ResponseEntity<>(service.create(dto), HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public GroupDto update(@PathVariable String id, @RequestBody GroupDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
