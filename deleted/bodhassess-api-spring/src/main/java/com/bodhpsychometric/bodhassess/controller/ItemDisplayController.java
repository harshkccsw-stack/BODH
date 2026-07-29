package com.bodhpsychometric.bodhassess.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.ItemDisplayDtos;
import com.bodhpsychometric.bodhassess.service.ItemDisplayService;

@RestController
@RequestMapping("/api/v1/item-display")
public class ItemDisplayController {

    @Autowired
    private ItemDisplayService service;

    @GetMapping
    public List<ItemDisplayDtos.ItemDisplayRow> list() { return service.list(); }

    @PostMapping("/override")
    public ItemDisplayDtos.UpsertOverrideRequest upsertOverride(@RequestBody ItemDisplayDtos.UpsertOverrideRequest req) {
        return service.upsertOverride(req);
    }

    @PostMapping("/{id}/delete")
    public ResponseEntity<Void> markDeleted(@PathVariable String id) {
        service.markDeleted(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> clear(@PathVariable String id) {
        service.clear(id);
        return ResponseEntity.noContent().build();
    }
}
