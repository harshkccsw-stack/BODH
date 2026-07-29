package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.model.PortalSession;
import com.bodhpsychometric.bodhassess.model.PortalSessionDemographic;
import com.bodhpsychometric.bodhassess.model.PortalSessionMqtScore;
import com.bodhpsychometric.bodhassess.payload.CellEditDto;
import com.bodhpsychometric.bodhassess.payload.CellEditErrorDto;
import com.bodhpsychometric.bodhassess.payload.DatasetColumnDto;
import com.bodhpsychometric.bodhassess.payload.DatasetEditResponseDto;
import com.bodhpsychometric.bodhassess.payload.DatasetResponseDto;
import com.bodhpsychometric.bodhassess.repository.PortalSessionRepository;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;

/**
 * Builds self-describing "dataset" views for the in-app data grid. v1 serves
 * the Sessions/Results view: one row per {@link PortalSession}, with core
 * fields plus a dynamic column per measured quality (MQT) and per demographic
 * field. Row-level scope is enforced here, not in the UI.
 */
@Service
@Transactional
public class DatasetService {

    private static final Logger log = LoggerFactory.getLogger(DatasetService.class);
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_OFFSET_DATE_TIME;

    // Metadata columns safe to edit in Phase 3 (no score recompute involved).
    // Demographic columns (demo:*) are also editable; raw answers and computed
    // scores are deferred to later phases.
    private static final Set<String> EDITABLE_CORE =
            Set.of("respondentName", "respondentEmail", "status", "groupName");

    // Core PortalSession columns, in display order. {key, label, type}.
    private static final String[][] CORE_COLUMNS = {
            {"respondentName", "Respondent", "string"},
            {"respondentEmail", "Email", "string"},
            {"instrument", "Instrument", "string"},
            {"vertical", "Vertical", "string"},
            {"groupName", "Group", "string"},
            {"entityName", "Organisation", "string"},
            {"status", "Status", "enum"},
            {"score", "Overall Score", "string"},
            {"startedAt", "Started", "datetime"},
            {"completedAt", "Completed", "datetime"},
            {"createdAt", "Created", "datetime"},
    };

    @Autowired
    private PortalSessionRepository repo;

    @Autowired
    private AuditService audit;

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public DatasetResponseDto sessions(UserPrincipal principal, String entityId, String questionnaireId) {
        List<PortalSession> sessions = repo.findAllOrderByCreated();

        // Apply scope + optional filters before building columns so dynamic
        // columns only reflect data the caller is actually allowed to see.
        List<PortalSession> scoped = new ArrayList<>();
        for (PortalSession s : sessions) {
            if (!isVisibleTo(s, principal)) continue;
            if (StringUtils.hasText(entityId) && !entityId.equals(s.getEntityId())) continue;
            if (StringUtils.hasText(questionnaireId) && !questionnaireId.equals(s.getAssessmentId())) continue;
            scoped.add(s);
        }

        boolean maskPii = isResearcher(principal) && !isAdmin(principal);
        List<DatasetColumnDto> columns = buildColumns(scoped);
        List<Map<String, Object>> rows = new ArrayList<>(scoped.size());
        for (PortalSession s : scoped) {
            rows.add(buildRow(s, maskPii));
        }

        log.debug("dataset/sessions: {} rows, {} columns for actor {}",
                rows.size(), columns.size(), principal == null ? "anonymous" : principal.getId());
        return new DatasetResponseDto("sessions", columns, rows);
    }

    /* ----------------------------------------------------------------- */
    /* Editing (Phase 3: audited metadata edits)                          */
    /* ----------------------------------------------------------------- */

    /**
     * Apply a batch of cell edits. Each row is loaded, scope-checked, and
     * guarded by optimistic concurrency on {@code updated_at}; valid edits are
     * applied and audited. Invalid / conflicting edits are reported per-cell
     * without aborting the rest of the batch.
     */
    @Transactional
    public DatasetEditResponseDto applyEdits(UserPrincipal principal, List<CellEditDto> edits) {
        if (!canWrite(principal)) {
            throw new AccessDeniedException("You do not have permission to edit this data.");
        }
        DatasetEditResponseDto resp = new DatasetEditResponseDto();
        if (edits == null || edits.isEmpty()) return resp;

        boolean maskPii = isResearcher(principal) && !isAdmin(principal);

        // Group edits by row so each session is loaded once and flushed once.
        Map<String, List<CellEditDto>> byRow = new LinkedHashMap<>();
        for (CellEditDto e : edits) {
            if (e == null || e.getRowId() == null) continue;
            byRow.computeIfAbsent(e.getRowId(), k -> new ArrayList<>()).add(e);
        }

        for (Map.Entry<String, List<CellEditDto>> entry : byRow.entrySet()) {
            String rowId = entry.getKey();
            PortalSession s = repo.findById(rowId).orElse(null);
            if (s == null) {
                resp.getErrors().add(new CellEditErrorDto(rowId, null, "Row not found."));
                continue;
            }
            if (!isVisibleTo(s, principal)) {
                resp.getErrors().add(new CellEditErrorDto(rowId, null, "Not authorised for this row."));
                continue;
            }

            boolean rowChanged = false;
            String loadedStamp = iso(s.getUpdatedAt());
            for (CellEditDto e : entry.getValue()) {
                // Optimistic concurrency: reject if the row moved under us.
                if (e.getRowUpdatedAt() != null && loadedStamp != null
                        && !loadedStamp.equals(e.getRowUpdatedAt())) {
                    CellEditErrorDto err = new CellEditErrorDto(rowId, e.getColumnKey(),
                            "Row changed since it was loaded. Refresh and retry.");
                    err.setConflict(true);
                    err.setCurrentUpdatedAt(loadedStamp);
                    resp.getErrors().add(err);
                    continue;
                }
                try {
                    Object before = applyCell(s, e.getColumnKey(), e.getNewValue());
                    audit.record("dataset.cell.edit", "PortalSession", rowId,
                            editPayload(e.getColumnKey(), before),
                            editPayload(e.getColumnKey(), e.getNewValue()));
                    rowChanged = true;
                } catch (IllegalArgumentException ex) {
                    resp.getErrors().add(new CellEditErrorDto(rowId, e.getColumnKey(), ex.getMessage()));
                }
            }

            if (rowChanged) {
                // Flush so the DB stamps the new updated_at, then refresh to read
                // it back into the returned row.
                em.flush();
                em.refresh(s);
                resp.getRows().add(buildRow(s, maskPii));
                resp.setApplied(resp.getApplied() + 1);
            }
        }
        return resp;
    }

    private Map<String, Object> editPayload(String columnKey, Object value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("column", columnKey);
        m.put("value", value == null ? "" : value);
        return m;
    }

    /**
     * Apply one cell change to the managed session, returning the previous
     * value. Throws {@link IllegalArgumentException} for non-editable columns
     * or invalid values.
     */
    private Object applyCell(PortalSession s, String columnKey, Object newValue) {
        String v = newValue == null ? null : String.valueOf(newValue);
        if (columnKey == null) throw new IllegalArgumentException("Missing column.");

        switch (columnKey) {
            case "respondentName": {
                Object before = s.getRespondentName();
                s.setRespondentName(v);
                return before;
            }
            case "respondentEmail": {
                if (v != null && !v.isBlank() && !v.contains("@")) {
                    throw new IllegalArgumentException("Invalid email address.");
                }
                Object before = s.getRespondentEmail();
                s.setRespondentEmail(v);
                return before;
            }
            case "status": {
                if (v == null || v.isBlank()) {
                    throw new IllegalArgumentException("Status cannot be empty.");
                }
                Object before = s.getStatus();
                s.setStatus(v);
                return before;
            }
            case "groupName": {
                Object before = s.getGroupName();
                s.setGroupName(v);
                return before;
            }
            default:
                if (columnKey.startsWith("demo:")) {
                    return applyDemographic(s, columnKey.substring("demo:".length()), v);
                }
                throw new IllegalArgumentException("Column is not editable: " + columnKey);
        }
    }

    private Object applyDemographic(PortalSession s, String fieldKey, String value) {
        if (!StringUtils.hasText(fieldKey)) throw new IllegalArgumentException("Missing demographic key.");
        if (s.getDemographics() != null) {
            for (PortalSessionDemographic d : s.getDemographics()) {
                if (fieldKey.equals(d.getFieldKey())) {
                    Object before = d.getValue();
                    d.setValue(value);
                    return before;
                }
            }
        }
        // No existing answer for this field — create one (cascaded from session).
        PortalSessionDemographic d = new PortalSessionDemographic();
        d.setSession(s);
        d.setFieldKey(fieldKey);
        d.setValue(value);
        s.getDemographics().add(d);
        return null;
    }

    private boolean canWrite(UserPrincipal principal) {
        if (principal == null) return false;
        if (isResearcher(principal) && !isAdmin(principal)) return false; // researchers read-only
        return principal.getUserType() == UserPrincipal.UserType.ADMIN
                || principal.getUserType() == UserPrincipal.UserType.PRACTITIONER;
    }

    /* ----------------------------------------------------------------- */
    /* Scope                                                              */
    /* ----------------------------------------------------------------- */

    private boolean isVisibleTo(PortalSession s, UserPrincipal principal) {
        if (principal == null) return false;
        if (isAdmin(principal)) return true;
        // Respondents only see their own sessions.
        if (principal.getUserType() == UserPrincipal.UserType.RESPONDENT) {
            return principal.getId() != null && principal.getId().equals(s.getRespondentId());
        }
        // TODO(scope): practitioners should be limited to their own entity once
        // the practitioner→entity mapping is wired. Until then they see all.
        return true;
    }

    private boolean isAdmin(UserPrincipal principal) {
        return principal != null && principal.getUserType() == UserPrincipal.UserType.ADMIN;
    }

    private boolean isResearcher(UserPrincipal principal) {
        return principal != null && principal.getRoles() != null
                && principal.getRoles().stream().anyMatch(r -> r != null && r.toLowerCase().contains("research"));
    }

    /* ----------------------------------------------------------------- */
    /* Column assembly                                                    */
    /* ----------------------------------------------------------------- */

    private List<DatasetColumnDto> buildColumns(List<PortalSession> sessions) {
        List<DatasetColumnDto> columns = new ArrayList<>();
        for (String[] c : CORE_COLUMNS) {
            DatasetColumnDto col = new DatasetColumnDto(c[0], c[1], c[2], "core");
            if (EDITABLE_CORE.contains(c[0])) col.setEditable("field");
            columns.add(col);
        }

        // Dynamic score columns: union of MQTs seen across the scoped sessions,
        // sorted by label for stable ordering. Keyed by mqtId to stay unique.
        Map<String, String> mqtLabels = new TreeMap<>();
        Map<String, String> demoKeys = new TreeMap<>();
        for (PortalSession s : sessions) {
            if (s.getMqtScores() != null) {
                for (PortalSessionMqtScore m : s.getMqtScores()) {
                    if (m.getMqtId() == null) continue;
                    mqtLabels.putIfAbsent(m.getMqtId(),
                            StringUtils.hasText(m.getMqtName()) ? m.getMqtName() : m.getMqtId());
                }
            }
            if (s.getDemographics() != null) {
                for (PortalSessionDemographic d : s.getDemographics()) {
                    if (d.getFieldKey() == null) continue;
                    demoKeys.putIfAbsent(d.getFieldKey(), d.getFieldKey());
                }
            }
        }
        for (Map.Entry<String, String> e : mqtLabels.entrySet()) {
            columns.add(new DatasetColumnDto("mqt:" + e.getKey(), e.getValue(), "number", "scores"));
        }
        for (Map.Entry<String, String> e : demoKeys.entrySet()) {
            DatasetColumnDto col = new DatasetColumnDto("demo:" + e.getKey(), humanize(e.getValue()), "string", "demographics");
            col.setEditable("field");
            columns.add(col);
        }
        return columns;
    }

    private Map<String, Object> buildRow(PortalSession s, boolean maskPii) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("rowId", s.getId());
        row.put("_updatedAt", iso(s.getUpdatedAt()));

        row.put("respondentName", maskPii ? pseudonym(s.getRespondentId()) : s.getRespondentName());
        row.put("respondentEmail", maskPii ? null : s.getRespondentEmail());
        row.put("instrument", StringUtils.hasText(s.getInstrumentFullName()) ? s.getInstrumentFullName() : s.getInstrument());
        row.put("vertical", s.getVertical());
        row.put("groupName", s.getGroupName());
        row.put("entityName", s.getEntityName());
        row.put("status", s.getStatus());
        row.put("score", s.getScore());
        row.put("startedAt", iso(s.getStartedAt()));
        row.put("completedAt", iso(s.getCompletedAt()));
        row.put("createdAt", iso(s.getCreatedAt()));

        if (s.getMqtScores() != null) {
            for (PortalSessionMqtScore m : s.getMqtScores()) {
                if (m.getMqtId() != null) row.put("mqt:" + m.getMqtId(), m.getScore());
            }
        }
        if (s.getDemographics() != null) {
            for (PortalSessionDemographic d : s.getDemographics()) {
                if (d.getFieldKey() != null) row.put("demo:" + d.getFieldKey(), d.getValue());
            }
        }
        return row;
    }

    /* ----------------------------------------------------------------- */
    /* Helpers                                                            */
    /* ----------------------------------------------------------------- */

    private String iso(OffsetDateTime dt) { return dt == null ? null : dt.format(ISO); }

    // Stable, non-reversible-looking pseudonym for researcher PII masking.
    private String pseudonym(String respondentId) {
        if (!StringUtils.hasText(respondentId)) return "Respondent";
        return "Respondent " + Integer.toHexString(respondentId.hashCode()).toUpperCase();
    }

    private String humanize(String key) {
        if (!StringUtils.hasText(key)) return key;
        String spaced = key.replace('_', ' ').replace('-', ' ').trim();
        return spaced.substring(0, 1).toUpperCase() + spaced.substring(1);
    }
}
