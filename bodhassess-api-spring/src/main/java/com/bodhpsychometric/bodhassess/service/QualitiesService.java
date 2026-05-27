package com.bodhpsychometric.bodhassess.service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.MeasuredQuality;
import com.bodhpsychometric.bodhassess.model.Mqt;
import com.bodhpsychometric.bodhassess.payload.QualityDto;
import com.bodhpsychometric.bodhassess.repository.MeasuredQualityRepository;

@Service
@Transactional
public class QualitiesService {

    @Autowired
    private MeasuredQualityRepository repo;

    @Transactional(readOnly = true)
    public List<QualityDto> list() {
        return repo.findAllOrderByName().stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public QualityDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Quality", "id", id)));
    }

    public QualityDto upsert(QualityDto dto) {
        if (!StringUtils.hasText(dto.getId())) throw new BadRequestException("id is required");
        if (!StringUtils.hasText(dto.getName())) throw new BadRequestException("name is required");

        MeasuredQuality q = repo.findById(dto.getId()).orElseGet(MeasuredQuality::new);
        q.setId(dto.getId());
        q.setName(dto.getName());
        q.setDescription(dto.getDescription());

        // Rebuild the MQT tree from the DTO. orphanRemoval on MeasuredQuality
        // deletes anything no longer in the list; cascade ALL persists the
        // new tree on save.
        q.getMqts().clear();
        if (dto.getMqts() != null) {
            int idx = 0;
            for (QualityDto.MqtDto child : dto.getMqts()) {
                q.getMqts().add(buildMqt(q, null, child, idx++));
            }
        }
        return toDto(repo.save(q));
    }

    public QualityDto update(String id, QualityDto dto) {
        if (!StringUtils.hasText(id)) throw new BadRequestException("id is required");
        dto.setId(id);
        return upsert(dto);
    }

    public void delete(String id) {
        if (!repo.existsById(id)) {
            return; // idempotent delete (matches Go behavior)
        }
        repo.deleteById(id);
    }

    private Mqt buildMqt(MeasuredQuality mq, Mqt parent, QualityDto.MqtDto dto, int order) {
        Mqt m = new Mqt();
        m.setId(dto.getId());
        m.setName(dto.getName());
        m.setMq(mq);
        m.setParent(parent);
        m.setSortOrder(order);
        if (dto.getChildren() != null && !dto.getChildren().isEmpty()) {
            int idx = 0;
            for (QualityDto.MqtDto childDto : dto.getChildren()) {
                m.getChildren().add(buildMqt(mq, m, childDto, idx++));
            }
        }
        return m;
    }

    private QualityDto toDto(MeasuredQuality q) {
        QualityDto d = new QualityDto();
        d.setId(q.getId());
        d.setName(q.getName());
        d.setDescription(q.getDescription());
        d.setMqts(q.getMqts() == null ? new ArrayList<>() :
                q.getMqts().stream().map(this::entityToDto).collect(Collectors.toList()));
        return d;
    }

    private QualityDto.MqtDto entityToDto(Mqt m) {
        QualityDto.MqtDto out = new QualityDto.MqtDto();
        out.setId(m.getId());
        out.setName(m.getName());
        if (m.getChildren() != null && !m.getChildren().isEmpty()) {
            out.setChildren(m.getChildren().stream().map(this::entityToDto).collect(Collectors.toList()));
        }
        return out;
    }
}
