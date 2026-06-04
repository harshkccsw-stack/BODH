package com.bodhpsychometric.bodhassess.analytics.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.analytics.model.DsDerivedColumn;
import com.bodhpsychometric.bodhassess.analytics.model.DsSheet;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbook;
import com.bodhpsychometric.bodhassess.analytics.model.DsWorkbookShare;
import com.bodhpsychometric.bodhassess.analytics.payload.SheetDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookDto;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.CreateWorkbook;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookRequests.ShareWorkbook;
import com.bodhpsychometric.bodhassess.analytics.payload.WorkbookShareDto;
import com.bodhpsychometric.bodhassess.analytics.repository.DsDerivedColumnRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsSheetRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsWorkbookRepository;
import com.bodhpsychometric.bodhassess.analytics.repository.DsWorkbookShareRepository;
import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

@Service
@Transactional
public class WorkbookService {

    @Autowired private DsWorkbookRepository workbooks;
    @Autowired private DsSheetRepository sheets;
    @Autowired private DsDerivedColumnRepository columns;
    @Autowired private DsWorkbookShareRepository shares;
    @Autowired private DsMapper mapper;
    @Autowired private DataStudioAccess access;

    @Transactional(readOnly = true)
    public List<WorkbookDto> list(UserPrincipal principal) {
        access.requireExpert(principal);
        return workbooks.findAccessibleBy(principal.getId()).stream()
                .map(w -> mapper.toWorkbookDto(w, access.levelOf(w, principal)))
                .collect(Collectors.toList());
    }

    public WorkbookDto create(UserPrincipal principal, CreateWorkbook req) {
        access.requireExpert(principal);
        if (req == null || !StringUtils.hasText(req.getName())) {
            throw new BadRequestException("name is required");
        }
        DsWorkbook w = new DsWorkbook();
        w.setName(req.getName().trim());
        w.setDescription(req.getDescription());
        w.setOwnerId(principal.getId());
        w = workbooks.save(w);
        return mapper.toWorkbookDto(w, DataStudioAccess.OWNER);
    }

    @Transactional(readOnly = true)
    public WorkbookDto get(UserPrincipal principal, Long id) {
        DsWorkbook w = load(id);
        String level = access.requireRead(w, principal);
        WorkbookDto dto = mapper.toWorkbookDto(w, level);

        // Attach sheets (with their derived columns).
        List<SheetDto> sheetDtos = sheets.findByWorkbookIdOrderBySortOrderAscIdAsc(id).stream()
                .map(this::sheetWithColumns)
                .collect(Collectors.toList());
        dto.setSheets(sheetDtos);

        // Shares are visible to anyone who can read; only owners can change them.
        dto.setShares(shares.findByWorkbookId(id).stream()
                .map(mapper::toShareDto)
                .collect(Collectors.toList()));
        return dto;
    }

    public WorkbookDto update(UserPrincipal principal, Long id, CreateWorkbook req) {
        DsWorkbook w = load(id);
        String level = access.requireWrite(w, principal);
        if (req != null) {
            if (StringUtils.hasText(req.getName())) w.setName(req.getName().trim());
            if (req.getDescription() != null) w.setDescription(req.getDescription());
        }
        w = workbooks.save(w);
        return mapper.toWorkbookDto(w, level);
    }

    public void delete(UserPrincipal principal, Long id) {
        DsWorkbook w = load(id);
        access.requireManage(w, principal);
        // Cascade manually (children are linked by plain FK columns).
        for (DsSheet s : sheets.findByWorkbookIdOrderBySortOrderAscIdAsc(id)) {
            columns.deleteBySheetId(s.getId());
        }
        sheets.deleteByWorkbookId(id);
        shares.deleteByWorkbookId(id);
        workbooks.deleteById(id);
    }

    /* ---------- co-ownership ---------- */

    public WorkbookShareDto addShare(UserPrincipal principal, Long workbookId, ShareWorkbook req) {
        DsWorkbook w = load(workbookId);
        access.requireManage(w, principal);
        if (req == null || !StringUtils.hasText(req.getSharedWithUserId())) {
            throw new BadRequestException("sharedWithUserId is required");
        }
        String target = req.getSharedWithUserId().trim();
        if (target.equals(w.getOwnerId())) {
            throw new BadRequestException("The owner already has full access.");
        }
        String role = normaliseRole(req.getRole());

        DsWorkbookShare share = shares.findByWorkbookIdAndSharedWithUserId(workbookId, target)
                .orElseGet(DsWorkbookShare::new);
        share.setWorkbookId(workbookId);
        share.setSharedWithUserId(target);
        share.setRole(role);
        share.setGrantedBy(principal.getId());
        return mapper.toShareDto(shares.save(share));
    }

    public void removeShare(UserPrincipal principal, Long workbookId, String userId) {
        DsWorkbook w = load(workbookId);
        access.requireManage(w, principal);
        shares.findByWorkbookIdAndSharedWithUserId(workbookId, userId)
                .ifPresent(shares::delete);
    }

    private String normaliseRole(String role) {
        if (!StringUtils.hasText(role)) return DsWorkbookShare.ROLE_EDITOR;
        String r = role.trim().toUpperCase();
        if (!DsWorkbookShare.ROLE_EDITOR.equals(r) && !DsWorkbookShare.ROLE_VIEWER.equals(r)) {
            throw new BadRequestException("role must be EDITOR or VIEWER");
        }
        return r;
    }

    private SheetDto sheetWithColumns(DsSheet s) {
        SheetDto dto = mapper.toSheetDto(s);
        List<DsDerivedColumn> cols = columns.findBySheetIdOrderBySortOrderAscIdAsc(s.getId());
        dto.setDerivedColumns(cols.stream().map(mapper::toColumnDto).collect(Collectors.toList()));
        return dto;
    }

    private DsWorkbook load(Long id) {
        return workbooks.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Workbook", "id", id));
    }
}
