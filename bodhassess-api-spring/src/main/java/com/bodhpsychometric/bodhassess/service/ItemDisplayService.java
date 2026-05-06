package com.bodhpsychometric.bodhassess.service;

import java.util.HashMap;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.model.ItemDisplayState;
import com.bodhpsychometric.bodhassess.payload.ItemDisplayDtos;
import com.bodhpsychometric.bodhassess.repository.ItemDisplayStateRepository;

@Service
@Transactional
public class ItemDisplayService {

    @Autowired
    private ItemDisplayStateRepository repo;

    @Transactional(readOnly = true)
    public List<ItemDisplayDtos.ItemDisplayRow> list() {
        return repo.findAll().stream().map(s -> {
            ItemDisplayDtos.ItemDisplayRow r = new ItemDisplayDtos.ItemDisplayRow();
            r.setItemId(s.getItemId());
            r.setOverride(s.getOverride() == null ? new HashMap<>() : s.getOverride());
            r.setDeleted(s.isDeleted());
            return r;
        }).collect(Collectors.toList());
    }

    public ItemDisplayDtos.UpsertOverrideRequest upsertOverride(ItemDisplayDtos.UpsertOverrideRequest req) {
        if (!StringUtils.hasText(req.getItemId())) {
            throw new BadRequestException("itemId required");
        }
        ItemDisplayState s = repo.findById(req.getItemId()).orElseGet(ItemDisplayState::new);
        s.setItemId(req.getItemId());
        s.setOverride(req.getOverride() == null ? new HashMap<>() : req.getOverride());
        repo.save(s);
        return req;
    }

    public void markDeleted(String id) {
        if (!StringUtils.hasText(id)) throw new BadRequestException("id required");
        ItemDisplayState s = repo.findById(id).orElseGet(ItemDisplayState::new);
        s.setItemId(id);
        s.setDeleted(true);
        repo.save(s);
    }

    public void clear(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }
}
