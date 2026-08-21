package com.bodhpsychometric.service.datastudio;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.DsColumnRequest;
import com.bodhpsychometric.dto.DsColumnResponse;
import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.dto.DsDatasetResponse.Column;
import com.bodhpsychometric.dto.DsExprResponse;
import com.bodhpsychometric.dto.DsSheetRequest;
import com.bodhpsychometric.dto.DsSheetResponse;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.datastudio.DsDerivedColumn;
import com.bodhpsychometric.model.datastudio.DsSheet;
import com.bodhpsychometric.model.datastudio.DsWorkbook;
import com.bodhpsychometric.repository.datastudio.DsDerivedColumnRepository;
import com.bodhpsychometric.repository.datastudio.DsSheetRepository;
import com.bodhpsychometric.repository.datastudio.DsWidgetRepository;
import com.bodhpsychometric.security.RequestActor;
import com.bodhpsychometric.service.datastudio.expression.ExpressionEvaluator;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService;
import com.bodhpsychometric.service.datastudio.expression.ExpressionService.Node;

/**
 * Sheets and their computed columns — the spreadsheet half of Data Studio.
 *
 * <h2>Nothing is stored but the definition</h2>
 * A sheet holds which assessment it is bound to and what formulas were
 * written. It never holds a value. {@link #data} re-pulls the live rows and
 * recomputes every column on every open, which is what makes a workbook safe
 * to keep for a year: it cannot drift out of step with the answers, and it
 * carries no respondent data of its own to go stale or leak.
 *
 * <h2>Every column is computed server-side</h2>
 * Even the ones classified CLIENT. The classification is a hint about where a
 * formula COULD run cheaply, not a claim about where it must; computing all of
 * them here means the browser and the server can never disagree about what a
 * cell says. Columns are computed in {@code sortOrder} and each result is
 * written back into the row before the next column runs, so a later formula
 * may reference an earlier one — which is the only reason that order has to be
 * deterministic.
 *
 * <h2>One evaluator per column</h2>
 * Not per sheet. The evaluator caches aggregates by the parser's per-parse
 * call id, and those ids restart at zero on each parse — so sharing one cache
 * across two columns would let the AVERAGE of one be served as the AVERAGE of
 * the other. A fresh evaluator per column is what keeps that impossible.
 */
@Service
@Transactional
public class DsSheetService {

    private final DsSheetRepository sheets;
    private final DsDerivedColumnRepository columns;
    private final DsWidgetRepository widgets;
    private final DsWorkbookService workbooks;
    private final DataStudioAccess access;
    private final DataStudioDatasetService datasets;
    private final ExpressionService expressions;
    private final DsMapper mapper;
    private final DsJson json;

    public DsSheetService(DsSheetRepository sheets,
            DsDerivedColumnRepository columns,
            DsWidgetRepository widgets,
            DsWorkbookService workbooks,
            DataStudioAccess access,
            DataStudioDatasetService datasets,
            ExpressionService expressions,
            DsMapper mapper,
            DsJson json) {
        this.sheets = sheets;
        this.columns = columns;
        this.widgets = widgets;
        this.workbooks = workbooks;
        this.access = access;
        this.datasets = datasets;
        this.expressions = expressions;
        this.mapper = mapper;
        this.json = json;
    }

    /* ---------------- sheets ---------------- */

    public DsSheetResponse create(Long dsWorkbookId, DsSheetRequest request) {
        RequestActor actor = access.requireActor();
        DsWorkbook workbook = workbooks.load(dsWorkbookId);
        access.requireWrite(workbook, actor);

        String name = request.name() == null ? "" : request.name().trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("Sheet name is required");
        }
        Map<String, Object> filters = request.sourceFilters() == null
                ? Map.of()
                : request.sourceFilters();
        Long assessmentId = DsJson.longOf(filters, "assessmentId");
        if (assessmentId == null) {
            throw new IllegalArgumentException(
                    "sourceFilters.assessmentId is required — a sheet is bound to one assessment");
        }
        // Fail here rather than on first open: a sheet pointing at nothing is
        // a broken tab the user then has to work out how to delete.
        datasets.dataset(assessmentId, DsJson.longOf(filters, "organizationId"))
                .orElseThrow(() -> new NotFoundException("Assessment " + assessmentId + " not found"));

        DsSheet sheet = new DsSheet();
        sheet.setWorkbook(workbook);
        sheet.setName(name);
        sheet.setSourceFilters(json.write(filters));
        if (request.sourceView() != null && !request.sourceView().isBlank()) {
            sheet.setSourceView(request.sourceView().trim());
        }
        if (request.grain() != null && !request.grain().isBlank()) {
            sheet.setGrain(request.grain().trim());
        }
        sheet.setDisplayState(json.write(request.displayState()));
        sheet.setSortOrder((int) sheets.countByWorkbook_DsWorkbookId(dsWorkbookId));
        return withColumns(sheets.save(sheet));
    }

    @Transactional(readOnly = true)
    public DsSheetResponse get(Long dsSheetId) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireRead(sheet.getWorkbook(), actor);
        return withColumns(sheet);
    }

    /** A null field means "leave it alone" — the grid saves display state alone. */
    public DsSheetResponse update(Long dsSheetId, DsSheetRequest request) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireWrite(sheet.getWorkbook(), actor);

        if (request.name() != null && !request.name().isBlank()) {
            sheet.setName(request.name().trim());
        }
        if (request.sourceFilters() != null) {
            Long assessmentId = DsJson.longOf(request.sourceFilters(), "assessmentId");
            if (assessmentId == null) {
                throw new IllegalArgumentException("sourceFilters.assessmentId is required");
            }
            sheet.setSourceFilters(json.write(request.sourceFilters()));
        }
        if (request.displayState() != null) {
            sheet.setDisplayState(json.write(request.displayState()));
        }
        if (request.sortOrder() != null) {
            sheet.setSortOrder(request.sortOrder());
        }
        return withColumns(sheets.save(sheet));
    }

    public void delete(Long dsSheetId) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireWrite(sheet.getWorkbook(), actor);

        // Pre-checked, never left to the foreign key: the point is a 409 that
        // says which dashboards would break, not a 500 at commit time.
        long boundWidgets = widgets.countBySheet_DsSheetId(dsSheetId);
        if (boundWidgets > 0) {
            throw new IllegalStateException("This sheet is used by " + boundWidgets
                    + " dashboard widget(s). Remove them before deleting the sheet.");
        }
        columns.deleteBySheet_DsSheetId(dsSheetId);
        sheets.delete(sheet);
    }

    /* ---------------- live data ---------------- */

    /**
     * The sheet's rows: live dataset plus every computed column, evaluated
     * over the whole population so ZSCORE and friends mean what they say.
     */
    @Transactional(readOnly = true)
    public DsDatasetResponse data(Long dsSheetId) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireRead(sheet.getWorkbook(), actor);
        return compute(sheet);
    }

    /**
     * Shared by {@link #data} and the query endpoint, which needs the same
     * fully-computed rows before it can group by a computed column. Assumes
     * the caller has already checked access.
     */
    DsDatasetResponse compute(DsSheet sheet) {
        Map<String, Object> filters = json.read(sheet.getSourceFilters());
        Long assessmentId = DsJson.longOf(filters, "assessmentId");
        DsDatasetResponse base = datasets
                .dataset(assessmentId, DsJson.longOf(filters, "organizationId"))
                .orElseThrow(() -> new NotFoundException(
                        "Assessment " + assessmentId + " no longer exists"));

        List<Map<String, Object>> rows = base.rows();
        List<Column> outColumns = new ArrayList<>(base.columns());

        for (DsDerivedColumn column : columns
                .findBySheet_DsSheetIdOrderBySortOrderAscDsDerivedColumnIdAsc(sheet.getDsSheetId())) {
            outColumns.add(new Column(column.getColKey(), column.getLabel(),
                    "number".equals(column.getResultType()) ? "number" : "string", "derived"));

            Node ast;
            try {
                ast = expressions.parse(column.getExpr());
            } catch (RuntimeException e) {
                // A saved column was valid when saved; if the dataset has since
                // lost a column it referenced, the cell goes blank rather than
                // taking the whole sheet down.
                for (Map<String, Object> row : rows) {
                    row.put(column.getColKey(), null);
                }
                continue;
            }
            // Fresh evaluator per column — see the class note on cache ids.
            ExpressionEvaluator evaluator = new ExpressionEvaluator(rows);
            for (Map<String, Object> row : rows) {
                row.put(column.getColKey(), evaluator.eval(ast, row));
            }
        }
        return new DsDatasetResponse("sheet:" + sheet.getDsSheetId(), outColumns, rows);
    }

    /* ---------------- computed columns ---------------- */

    /** Live type-check as the user types. Never an error response. */
    @Transactional(readOnly = true)
    public DsExprResponse validateExpr(Long dsSheetId, String expr) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireRead(sheet.getWorkbook(), actor);
        return expressions.validate(expr, availableColumns(sheet, null));
    }

    /**
     * Add a column, or replace one in place when {@code existingKey} is given.
     *
     * <p>The key is generated once from the label and then frozen: other
     * formulas reference the column by it, so regenerating on a rename would
     * silently break them. Editing a column therefore changes its label,
     * formula, inferred type and eval target — never its identity.
     */
    public DsColumnResponse saveColumn(Long dsSheetId, String existingKey, DsColumnRequest request) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireWrite(sheet.getWorkbook(), actor);

        // A column being edited is excluded from its own available set, so a
        // formula cannot end up referencing itself and recursing forever.
        DsExprResponse analysis = expressions.validate(request.expr(),
                availableColumns(sheet, existingKey));
        if (!analysis.ok()) {
            throw new IllegalArgumentException("Invalid formula: "
                    + String.join(" ", analysis.errors()));
        }

        DsDerivedColumn column;
        if (existingKey == null) {
            column = new DsDerivedColumn();
            column.setSheet(sheet);
            column.setColKey(uniqueKey(dsSheetId, request.label()));
            column.setSortOrder((int) columns.countBySheet_DsSheetId(dsSheetId));
        } else {
            column = columns.findBySheet_DsSheetIdAndColKey(dsSheetId, existingKey)
                    .orElseThrow(() -> new NotFoundException(
                            "Column " + existingKey + " not found on this sheet"));
        }

        column.setLabel(request.label().trim());
        column.setExpr(request.expr());
        column.setResultType(analysis.resultType());
        column.setEvalTarget(resolveTarget(request.evalTarget(), analysis.evalTarget()));
        column.setFormat(request.format());
        return DsColumnResponse.from(columns.save(column));
    }

    public void deleteColumn(Long dsSheetId, String colKey) {
        RequestActor actor = access.requireActor();
        DsSheet sheet = load(dsSheetId);
        access.requireWrite(sheet.getWorkbook(), actor);
        columns.findBySheet_DsSheetIdAndColKey(dsSheetId, colKey).ifPresent(columns::delete);
    }

    /* ---------------- helpers ---------------- */

    @Transactional(readOnly = true)
    public DsSheet load(Long dsSheetId) {
        return sheets.findWithWorkbook(dsSheetId)
                .orElseThrow(() -> new NotFoundException("Sheet " + dsSheetId + " not found"));
    }

    /**
     * What a formula on this sheet may name: every live dataset column, plus
     * the sheet's other computed columns. {@code excludeKey} drops the column
     * currently being edited so it cannot reference itself.
     */
    private Set<String> availableColumns(DsSheet sheet, String excludeKey) {
        Map<String, Object> filters = json.read(sheet.getSourceFilters());
        Set<String> keys = new LinkedHashSet<>(datasets.columnKeys(
                DsJson.longOf(filters, "assessmentId"),
                DsJson.longOf(filters, "organizationId")));
        for (DsDerivedColumn column : columns
                .findBySheet_DsSheetIdOrderBySortOrderAscDsDerivedColumnIdAsc(sheet.getDsSheetId())) {
            if (excludeKey == null || !excludeKey.equals(column.getColKey())) {
                keys.add(column.getColKey());
            }
        }
        return keys;
    }

    /** An override only counts if it names a real target; otherwise infer. */
    private String resolveTarget(String override, String inferred) {
        if (override == null || override.isBlank()) {
            return inferred;
        }
        String upper = override.trim().toUpperCase(Locale.ROOT);
        return ExpressionService.CLIENT.equals(upper) || ExpressionService.SERVER.equals(upper)
                ? upper
                : inferred;
    }

    /**
     * "Wellbeing index" → {@code calc:wellbeing_index}, with a numeric suffix
     * if that is taken. Pre-checked against the unique key rather than caught,
     * because catching it inside a transaction marks it rollback-only and the
     * 409 becomes a 500 at commit.
     */
    private String uniqueKey(Long dsSheetId, String label) {
        String slug = label.toLowerCase(Locale.ROOT).trim()
                .replaceAll("[^a-z0-9]+", "_")
                .replaceAll("^_+|_+$", "");
        if (slug.isEmpty()) {
            slug = "col";
        }
        String base = "calc:" + slug;
        String candidate = base;
        int n = 2;
        while (columns.existsBySheet_DsSheetIdAndColKey(dsSheetId, candidate)) {
            candidate = base + "_" + n++;
        }
        return candidate;
    }

    private DsSheetResponse withColumns(DsSheet sheet) {
        return mapper.toSheet(sheet,
                columns.findBySheet_DsSheetIdOrderBySortOrderAscDsDerivedColumnIdAsc(sheet.getDsSheetId()));
    }
}
