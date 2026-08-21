package com.bodhpsychometric.service.datastudio;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsDashboardResponse;
import com.bodhpsychometric.dto.DsShareRequest;
import com.bodhpsychometric.dto.DsShareResponse;
import com.bodhpsychometric.dto.DsSheetResponse;
import com.bodhpsychometric.dto.DsWorkbookRequest;
import com.bodhpsychometric.dto.DsWorkbookResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.model.datastudio.DsDashboard;
import com.bodhpsychometric.model.datastudio.DsSheet;
import com.bodhpsychometric.model.datastudio.DsWorkbook;
import com.bodhpsychometric.model.datastudio.DsWorkbookShare;
import com.bodhpsychometric.repository.auth.UserRepository;
import com.bodhpsychometric.repository.datastudio.DsDashboardRepository;
import com.bodhpsychometric.repository.datastudio.DsDerivedColumnRepository;
import com.bodhpsychometric.repository.datastudio.DsSheetRepository;
import com.bodhpsychometric.repository.datastudio.DsWidgetRepository;
import com.bodhpsychometric.repository.datastudio.DsWorkbookRepository;
import com.bodhpsychometric.repository.datastudio.DsWorkbookShareRepository;
import com.bodhpsychometric.security.RequestActor;

/**
 * Workbooks and who they are shared with.
 *
 * <p>The gallery listing is deliberately shallow — name, counts, the caller's
 * access level — because a gallery of twenty workbooks does not need two
 * hundred sheet definitions to render three cards. The single-workbook fetch
 * fills in sheets, dashboards and shares.
 */
@Service
@Transactional
public class DsWorkbookService {

    private final DsWorkbookRepository workbooks;
    private final DsSheetRepository sheets;
    private final DsDerivedColumnRepository columns;
    private final DsDashboardRepository dashboards;
    private final DsWidgetRepository widgets;
    private final DsWorkbookShareRepository shares;
    private final UserRepository users;
    private final DataStudioAccess access;
    private final DsMapper mapper;

    public DsWorkbookService(DsWorkbookRepository workbooks,
            DsSheetRepository sheets,
            DsDerivedColumnRepository columns,
            DsDashboardRepository dashboards,
            DsWidgetRepository widgets,
            DsWorkbookShareRepository shares,
            UserRepository users,
            DataStudioAccess access,
            DsMapper mapper) {
        this.workbooks = workbooks;
        this.sheets = sheets;
        this.columns = columns;
        this.dashboards = dashboards;
        this.widgets = widgets;
        this.shares = shares;
        this.users = users;
        this.access = access;
        this.mapper = mapper;
    }

    /** Everything the caller owns or has been shared, newest first. */
    @Transactional(readOnly = true)
    public List<DsWorkbookResponse> listVisible() {
        RequestActor actor = access.requireActor();
        List<DsWorkbook> found = actor.superAdmin()
                ? workbooks.findAllForGallery()
                : workbooks.findVisibleTo(actor.userId());
        List<DsWorkbookResponse> out = new ArrayList<>(found.size());
        for (DsWorkbook workbook : found) {
            out.add(shallow(workbook, access.levelOf(workbook, actor)));
        }
        return out;
    }

    /** One workbook with its sheets, dashboards and share list. */
    @Transactional(readOnly = true)
    public DsWorkbookResponse get(Long dsWorkbookId) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = load(dsWorkbookId);
        String level = access.requireRead(workbook, actor);
        return deep(workbook, level);
    }

    public DsWorkbookResponse create(DsWorkbookRequest request) {
        RequestActor actor = access.requireActor();
        User owner = users.findById(actor.userId())
                .orElseThrow(() -> new NotFoundException("Signed-in user no longer exists"));
        DsWorkbook workbook = new DsWorkbook();
        workbook.setOwner(owner);
        workbook.setName(request.name().trim());
        workbook.setDescription(trimToNull(request.description()));
        return deep(workbooks.save(workbook), DataStudioAccess.OWNER);
    }

    public DsWorkbookResponse update(Long dsWorkbookId, DsWorkbookRequest request) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = load(dsWorkbookId);
        String level = access.requireWrite(workbook, actor);
        workbook.setName(request.name().trim());
        workbook.setDescription(trimToNull(request.description()));
        return deep(workbooks.save(workbook), level);
    }

    /**
     * Delete a workbook and everything inside it.
     *
     * <p>Swept in an explicit order rather than by cascade, because a widget
     * points at a sheet in the same workbook: let the database decide the
     * order and the sheet delete can hit that foreign key first. Widgets go,
     * then dashboards, then computed columns, then sheets, then the share
     * grants, then the workbook itself.
     */
    public void delete(Long dsWorkbookId) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = load(dsWorkbookId);
        // Deleting the whole thing is the owner's call, not an editor's — an
        // editor was let in to work on it, not to destroy it.
        access.requireOwner(workbook, actor);

        for (DsDashboard dashboard : dashboards
                .findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsDashboardIdAsc(dsWorkbookId)) {
            widgets.deleteByDashboard_DsDashboardId(dashboard.getDsDashboardId());
        }
        dashboards.deleteAll(dashboards
                .findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsDashboardIdAsc(dsWorkbookId));

        List<DsSheet> workbookSheets =
                sheets.findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsSheetIdAsc(dsWorkbookId);
        for (DsSheet sheet : workbookSheets) {
            columns.deleteBySheet_DsSheetId(sheet.getDsSheetId());
        }
        sheets.deleteAll(workbookSheets);

        shares.deleteByWorkbook_DsWorkbookId(dsWorkbookId);
        workbooks.delete(workbook);
    }

    /* ---------------- sharing ---------------- */

    /**
     * Let another dashboard user in, or change the role of someone already in.
     * Re-granting updates the existing row: the unique key means a second one
     * cannot exist, and inserting blindly would 500 at commit rather than do
     * the obvious thing.
     */
    public DsShareResponse share(Long dsWorkbookId, DsShareRequest request) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = load(dsWorkbookId);
        access.requireOwner(workbook, actor);

        Long targetUserId = request.sharedWithUserId();
        if (workbook.getOwner().getId().equals(targetUserId)) {
            throw new IllegalArgumentException("The owner already has full access to this workbook");
        }
        User target = users.findById(targetUserId)
                .orElseThrow(() -> new NotFoundException("User " + targetUserId + " not found"));

        String role = DsWorkbookShare.ROLE_VIEWER.equals(request.role())
                ? DsWorkbookShare.ROLE_VIEWER
                : DsWorkbookShare.ROLE_EDITOR;

        DsWorkbookShare share = shares
                .findByWorkbook_DsWorkbookIdAndSharedWith_Id(dsWorkbookId, targetUserId)
                .orElseGet(DsWorkbookShare::new);
        share.setWorkbook(workbook);
        share.setSharedWith(target);
        share.setRole(role);
        share.setGrantedByUserId(actor.userId());
        return DsShareResponse.from(shares.save(share));
    }

    public void unshare(Long dsWorkbookId, Long sharedWithUserId) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = load(dsWorkbookId);
        access.requireOwner(workbook, actor);
        shares.findByWorkbook_DsWorkbookIdAndSharedWith_Id(dsWorkbookId, sharedWithUserId)
                .ifPresent(shares::delete);
    }

    /* ---------------- helpers ---------------- */

    /** Loaded for the access check — never returned without one. */
    @Transactional(readOnly = true)
    public DsWorkbook load(Long dsWorkbookId) {
        return workbooks.findById(dsWorkbookId)
                .orElseThrow(() -> new NotFoundException("Workbook " + dsWorkbookId + " not found"));
    }

    private DsWorkbookResponse shallow(DsWorkbook workbook, String level) {
        return new DsWorkbookResponse(
                workbook.getDsWorkbookId(),
                workbook.getName(),
                workbook.getDescription(),
                workbook.getOwner().getId(),
                workbook.getOwner().getEmail(),
                level,
                (int) sheets.countByWorkbook_DsWorkbookId(workbook.getDsWorkbookId()),
                (int) dashboards.countByWorkbook_DsWorkbookId(workbook.getDsWorkbookId()),
                List.of(), List.of(), List.of(),
                workbook.getCreatedAt() == null ? null : workbook.getCreatedAt().toString(),
                workbook.getUpdatedAt() == null ? null : workbook.getUpdatedAt().toString());
    }

    private DsWorkbookResponse deep(DsWorkbook workbook, String level) {
        Long id = workbook.getDsWorkbookId();

        List<DsSheetResponse> sheetDtos = new ArrayList<>();
        for (DsSheet sheet : sheets.findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsSheetIdAsc(id)) {
            sheetDtos.add(mapper.toSheet(sheet,
                    columns.findBySheet_DsSheetIdOrderBySortOrderAscDsDerivedColumnIdAsc(sheet.getDsSheetId())));
        }

        List<DsDashboardResponse> dashboardDtos = new ArrayList<>();
        for (DsDashboard dashboard
                : dashboards.findByWorkbook_DsWorkbookIdOrderBySortOrderAscDsDashboardIdAsc(id)) {
            dashboardDtos.add(mapper.toDashboard(dashboard,
                    widgets.findByDashboard_DsDashboardIdOrderBySortOrderAscDsWidgetIdAsc(
                            dashboard.getDsDashboardId())));
        }

        List<DsShareResponse> shareDtos = shares.findForWorkbook(id).stream()
                .map(DsShareResponse::from).toList();

        return new DsWorkbookResponse(
                id,
                workbook.getName(),
                workbook.getDescription(),
                workbook.getOwner().getId(),
                workbook.getOwner().getEmail(),
                level,
                sheetDtos.size(),
                dashboardDtos.size(),
                sheetDtos,
                dashboardDtos,
                shareDtos,
                workbook.getCreatedAt() == null ? null : workbook.getCreatedAt().toString(),
                workbook.getUpdatedAt() == null ? null : workbook.getUpdatedAt().toString());
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
