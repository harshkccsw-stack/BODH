package com.bodhpsychometric.bodhassess.analytics.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.analytics.expression.ExpressionService;
import com.bodhpsychometric.bodhassess.analytics.model.DsDerivedColumn;
import com.bodhpsychometric.bodhassess.analytics.model.DsSheet;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbook;
import com.bodhpsychometric.bodhassess.analytics.payload.DerivedColumnDto;
import com.bodhpsychometric.bodhassess.analytics.payload.SheetDto;
import com.bodhpsychometric.bodhassess.analytics.payload.ValidateExprResponseDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.CreateSheet;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.SaveColumn;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.UpdateSheet;
import com.bodhpsychometric.bodhassess.analytics.repository.DsDerivedColumnRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsSheetRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsWorkbookRepository;
import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.payload.DatasetColumnDto;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.DatasetService;

@Service
@Transactional
public class SheetService {

    @Autowired private DsSheetRepository sheets;
    @Autowired private DsWorkbookRepository workbooks;
    @Autowired private DsDerivedColumnRepository columns;
    @Autowired private DsMapper mapper;
    @Autowired private DataStudioAccess access;
    @Autowired private ExpressionService expressions;
    @Autowired private DatasetService datasets;

    /* ---------- sheets ---------- */

    public SheetDto create(UserPrincipal principal, Long workbookId, CreateSheet req) {
        DsWorkbook wb = loadWorkbook(workbookId);
        access.requireWrite(wb, principal);
        if (req == null || !StringUtils.hasText(req.getName())) {
            throw new BadRequestException("name is required");
        }
        DsSheet s = new DsSheet();
        s.setWorkbookId(workbookId);
        s.setName(req.getName().trim());
        if (StringUtils.hasText(req.getSourceView())) s.setSourceView(req.getSourceView().trim());
        if (StringUtils.hasText(req.getGrain())) s.setGrain(req.getGrain().trim());
        s.setSourceFilters(mapper.writeMap(req.getSourceFilters()));
        int count = sheets.findByWorkbookIdOrderBySortOrderAscIdAsc(workbookId).size();
        s.setSortOrder(count);
        return sheetWithColumns(sheets.save(s));
    }

    @Transactional(readOnly = true)
    public SheetDto get(UserPrincipal principal, Long sheetId) {
        DsSheet s = loadSheet(sheetId);
        access.requireRead(loadWorkbook(s.getWorkbookId()), principal);
        return sheetWithColumns(s);
    }

    public SheetDto update(UserPrincipal principal, Long sheetId, UpdateSheet req) {
        DsSheet s = loadSheet(sheetId);
        access.requireWrite(loadWorkbook(s.getWorkbookId()), principal);
        if (req != null) {
            if (StringUtils.hasText(req.getName())) s.setName(req.getName().trim());
            if (req.getSourceFilters() != null) s.setSourceFilters(mapper.writeMap(req.getSourceFilters()));
            if (req.getDisplayState() != null) s.setDisplayState(mapper.writeMap(req.getDisplayState()));
            if (req.getSortOrder() != null) s.setSortOrder(req.getSortOrder());
        }
        return sheetWithColumns(sheets.save(s));
    }

    public void delete(UserPrincipal principal, Long sheetId) {
        DsSheet s = loadSheet(sheetId);
        access.requireWrite(loadWorkbook(s.getWorkbookId()), principal);
        columns.deleteBySheetId(sheetId);
        sheets.deleteById(sheetId);
    }

    /* ---------- derived columns ---------- */

    public ValidateExprResponseDto validateExpr(UserPrincipal principal, Long sheetId, String expr) {
        DsSheet s = loadSheet(sheetId);
        access.requireRead(loadWorkbook(s.getWorkbookId()), principal);
        return expressions.validate(expr, availableColumns(principal, s, null));
    }

    public DerivedColumnDto saveColumn(UserPrincipal principal, Long sheetId, SaveColumn req) {
        DsSheet s = loadSheet(sheetId);
        access.requireWrite(loadWorkbook(s.getWorkbookId()), principal);
        if (req == null || !StringUtils.hasText(req.getLabel())) {
            throw new BadRequestException("label is required");
        }
        if (!StringUtils.hasText(req.getExpr())) {
            throw new BadRequestException("expr is required");
        }

        // A column may be updated in place (colKey supplied) — exclude it from
        // its own available-column set so it can't reference itself.
        String existingKey = StringUtils.hasText(req.getColKey()) ? req.getColKey().trim() : null;
        ValidateExprResponseDto analysis =
                expressions.validate(req.getExpr(), availableColumns(principal, s, existingKey));
        if (!analysis.isOk()) {
            throw new BadRequestException("Invalid formula: " + String.join(" ", analysis.getErrors()));
        }

        DsDerivedColumn col = existingKey == null
                ? new DsDerivedColumn()
                : columns.findBySheetIdAndColKey(sheetId, existingKey).orElseGet(DsDerivedColumn::new);

        col.setSheetId(sheetId);
        if (col.getColKey() == null) {
            col.setColKey(existingKey != null ? existingKey : uniqueKey(sheetId, req.getLabel()));
            col.setSortOrder(columns.findBySheetIdOrderBySortOrderAscIdAsc(sheetId).size());
        }
        col.setLabel(req.getLabel().trim());
        col.setExpr(req.getExpr());
        col.setResultType(analysis.getResultType());
        // Honour an explicit override, otherwise use the inferred target.
        col.setEvalTarget(resolveEvalTarget(req.getEvalTarget(), analysis.getEvalTarget()));
        col.setFormat(req.getFormat());
        return mapper.toColumnDto(columns.save(col));
    }

    public void deleteColumn(UserPrincipal principal, Long sheetId, String colKey) {
        DsSheet s = loadSheet(sheetId);
        access.requireWrite(loadWorkbook(s.getWorkbookId()), principal);
        columns.findBySheetIdAndColKey(sheetId, colKey).ifPresent(columns::delete);
    }

    /* ---------- helpers ---------- */

    private String resolveEvalTarget(String override, String inferred) {
        if (!StringUtils.hasText(override)) return inferred;
        String o = override.trim().toUpperCase();
        if (ExpressionService.CLIENT.equals(o) || ExpressionService.SERVER.equals(o)) return o;
        return inferred;
    }

    /**
     * The set of column keys a formula on this sheet may reference: every live
     * dataset column for the sheet's source view + filters, plus the sheet's
     * other derived columns ({@code excludeKey} omitted to prevent self-ref).
     */
    private Set<String> availableColumns(UserPrincipal principal, DsSheet s, String excludeKey) {
        Set<String> keys = new LinkedHashSet<>();
        var filters = mapper.readMap(s.getSourceFilters());
        String entityId = asString(filters.get("entityId"));
        String questionnaireId = asString(filters.get("questionnaireId"));
        for (DatasetColumnDto c : datasets.sessions(principal, entityId, questionnaireId).getColumns()) {
            keys.add(c.getKey());
        }
        for (DsDerivedColumn c : columns.findBySheetIdOrderBySortOrderAscIdAsc(s.getId())) {
            if (excludeKey == null || !excludeKey.equals(c.getColKey())) keys.add(c.getColKey());
        }
        return keys;
    }

    private String asString(Object o) { return o == null ? null : String.valueOf(o); }

    private String uniqueKey(Long sheetId, String label) {
        String slug = label.toLowerCase(Locale.ROOT).trim()
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (slug.isEmpty()) slug = "col";
        String base = "calc:" + slug;
        String candidate = base;
        int n = 2;
        while (columns.existsBySheetIdAndColKey(sheetId, candidate)) {
            candidate = base + "_" + n++;
        }
        return candidate;
    }

    private SheetDto sheetWithColumns(DsSheet s) {
        SheetDto dto = mapper.toSheetDto(s);
        List<DsDerivedColumn> cols = columns.findBySheetIdOrderBySortOrderAscIdAsc(s.getId());
        dto.setDerivedColumns(cols.stream().map(mapper::toColumnDto).collect(Collectors.toList()));
        return dto;
    }

    private DsSheet loadSheet(Long id) {
        return sheets.findById(id).orElseThrow(() -> new ResourceNotFoundException("Sheet", "id", id));
    }

    private DsWorkbook loadWorkbook(Long id) {
        return workbooks.findById(id).orElseThrow(() -> new ResourceNotFoundException("Workbook", "id", id));
    }
}
