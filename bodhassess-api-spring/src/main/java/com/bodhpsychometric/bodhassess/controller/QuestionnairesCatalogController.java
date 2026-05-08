package com.bodhpsychometric.bodhassess.controller;

import java.util.Map;

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

import com.bodhpsychometric.bodhassess.payload.InstrumentDtos;
import com.bodhpsychometric.bodhassess.payload.ItemDtos;
import com.bodhpsychometric.bodhassess.service.ItemsService;
import com.bodhpsychometric.bodhassess.service.QuestionnairesCatalogService;

@RestController
@RequestMapping("/api/v1/questionnaires-catalog")
public class QuestionnairesCatalogController {

    @Autowired
    private QuestionnairesCatalogService catalogService;

    @Autowired
    private ItemsService itemsService;

    @GetMapping
    public InstrumentDtos.InstrumentListResponse list(@RequestParam(value = "vertical", required = false) String vertical) {
        return catalogService.list(vertical);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        return catalogService.get(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        catalogService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<InstrumentDtos.CreateInstrumentResponse> createInstrument(
            @RequestBody InstrumentDtos.CreateInstrumentRequest req) {
        return new ResponseEntity<>(itemsService.createInstrument(req), HttpStatus.CREATED);
    }

    @GetMapping("/{instrumentId}/items")
    public ItemDtos.ItemListResponse listItems(@PathVariable String instrumentId) {
        return itemsService.listByInstrument(instrumentId);
    }

    @PostMapping("/{instrumentId}/items")
    public ResponseEntity<ItemDtos.CreateItemResponse> createItem(
            @PathVariable String instrumentId, @RequestBody ItemDtos.CreateItemRequest req) {
        return new ResponseEntity<>(itemsService.createItem(instrumentId, req), HttpStatus.CREATED);
    }

    @PostMapping("/{instrumentId}/items/bulk")
    public ResponseEntity<ItemDtos.BulkCreateItemsResponse> bulkCreateItems(
            @PathVariable String instrumentId, @RequestBody ItemDtos.BulkCreateItemsRequest req) {
        return new ResponseEntity<>(itemsService.bulkCreateItems(instrumentId, req), HttpStatus.CREATED);
    }
}
