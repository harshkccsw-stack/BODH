package com.bodhpsychometric.bodhassess.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.MeasuredQuality;
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
        q.setMqts(dto.getMqts() == null ? java.util.Collections.emptyList() :
                dto.getMqts().stream().map(this::dtoToEntity).collect(Collectors.toList()));
        return toDto(repo.save(q));
    }

    private MeasuredQuality.Mqt dtoToEntity(QualityDto.MqtDto m) {
        MeasuredQuality.Mqt out = new MeasuredQuality.Mqt();
        out.setId(m.getId());
        out.setName(m.getName());
        if (m.getChildren() != null && !m.getChildren().isEmpty()) {
            out.setChildren(m.getChildren().stream().map(this::dtoToEntity).collect(Collectors.toList()));
        }
        return out;
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

    private QualityDto toDto(MeasuredQuality q) {
        QualityDto d = new QualityDto();
        d.setId(q.getId());
        d.setName(q.getName());
        d.setDescription(q.getDescription());
        d.setMqts(q.getMqts() == null ? new java.util.ArrayList<>() :
                q.getMqts().stream().map(this::entityToDto).collect(Collectors.toList()));
        return d;
    }

    private QualityDto.MqtDto entityToDto(MeasuredQuality.Mqt m) {
        QualityDto.MqtDto out = new QualityDto.MqtDto();
        out.setId(m.getId());
        out.setName(m.getName());
        if (m.getChildren() != null && !m.getChildren().isEmpty()) {
            out.setChildren(m.getChildren().stream().map(this::entityToDto).collect(Collectors.toList()));
        }
        return out;
    }
}
