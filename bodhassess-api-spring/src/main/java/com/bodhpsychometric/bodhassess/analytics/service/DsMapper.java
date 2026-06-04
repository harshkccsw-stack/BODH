package com.bodhpsychometric.bodhassess.analytics.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.analytics.model.DsDashboard;
import com.bodhpsychometric.bodhassess.analytics.model.DsDerivedColumn;
import com.bodhpsychometric.bodhassess.analytics.model.DsSheet;
import com.bodhpsychometric.bodhassess.analytics.model.DsWidget;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbook;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbookShare;
import com.bodhpsychometric.bodhassess.analytics.payload.DashboardDto;
import com.bodhpsychometric.bodhassess.analytics.payload.DerivedColumnDto;
import com.bodhpsychometric.bodhassess.analytics.payload.SheetDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WidgetDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookShareDto;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Entity ⇄ DTO mapping plus JSON (de)serialisation for the JSON text columns. */
@Component
public class DsMapper {

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<Map<String, Object>>() {};

    private final ObjectMapper json;

    public DsMapper(ObjectMapper json) { this.json = json; }

    /* ---------- workbook ---------- */

    public WorkbookDto toWorkbookDto(DsWorkbook w, String access) {
        WorkbookDto d = new WorkbookDto();
        d.setId(w.getId());
        d.setName(w.getName());
        d.setDescription(w.getDescription());
        d.setOwnerId(w.getOwnerId());
        d.setAccess(access);
        d.setCreatedAt(iso(w.getCreatedAt()));
        d.setUpdatedAt(iso(w.getUpdatedAt()));
        return d;
    }

    public WorkbookShareDto toShareDto(DsWorkbookShare s) {
        WorkbookShareDto d = new WorkbookShareDto();
        d.setId(s.getId());
        d.setSharedWithUserId(s.getSharedWithUserId());
        d.setRole(s.getRole());
        d.setGrantedBy(s.getGrantedBy());
        d.setCreatedAt(iso(s.getCreatedAt()));
        return d;
    }

    /* ---------- sheet + columns ---------- */

    public SheetDto toSheetDto(DsSheet s) {
        SheetDto d = new SheetDto();
        d.setId(s.getId());
        d.setWorkbookId(s.getWorkbookId());
        d.setName(s.getName());
        d.setSourceView(s.getSourceView());
        d.setSourceFilters(readMap(s.getSourceFilters()));
        d.setGrain(s.getGrain());
        d.setDisplayState(readMap(s.getDisplayState()));
        d.setSortOrder(s.getSortOrder());
        d.setCreatedAt(iso(s.getCreatedAt()));
        d.setUpdatedAt(iso(s.getUpdatedAt()));
        return d;
    }

    public DerivedColumnDto toColumnDto(DsDerivedColumn c) {
        DerivedColumnDto d = new DerivedColumnDto();
        d.setId(c.getId());
        d.setColKey(c.getColKey());
        d.setLabel(c.getLabel());
        d.setExpr(c.getExpr());
        d.setEvalTarget(c.getEvalTarget());
        d.setResultType(c.getResultType());
        d.setFormat(c.getFormat());
        d.setSortOrder(c.getSortOrder());
        return d;
    }

    /* ---------- dashboard + widgets ---------- */

    public DashboardDto toDashboardDto(DsDashboard d) {
        DashboardDto dto = new DashboardDto();
        dto.setId(d.getId());
        dto.setWorkbookId(d.getWorkbookId());
        dto.setName(d.getName());
        dto.setLayout(readMap(d.getLayout()));
        dto.setSortOrder(d.getSortOrder());
        dto.setCreatedAt(iso(d.getCreatedAt()));
        dto.setUpdatedAt(iso(d.getUpdatedAt()));
        return dto;
    }

    public WidgetDto toWidgetDto(DsWidget w) {
        WidgetDto dto = new WidgetDto();
        dto.setId(w.getId());
        dto.setDashboardId(w.getDashboardId());
        dto.setType(w.getType());
        dto.setSheetId(w.getSheetId());
        dto.setConfig(readMap(w.getConfig()));
        dto.setPosX(w.getPosX());
        dto.setPosY(w.getPosY());
        dto.setW(w.getW());
        dto.setH(w.getH());
        dto.setSortOrder(w.getSortOrder());
        return dto;
    }

    /* ---------- json helpers ---------- */

    public Map<String, Object> readMap(String text) {
        if (!StringUtils.hasText(text)) return new LinkedHashMap<>();
        try {
            Map<String, Object> m = json.readValue(text, MAP_TYPE);
            return m == null ? new LinkedHashMap<>() : m;
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    public String writeMap(Map<String, Object> map) {
        if (map == null || map.isEmpty()) return null;
        try {
            return json.writeValueAsString(map);
        } catch (Exception e) {
            return null;
        }
    }

    private String iso(OffsetDateTime dt) { return dt == null ? null : dt.format(ISO); }
}
