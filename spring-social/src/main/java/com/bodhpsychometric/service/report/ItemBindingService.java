package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.dto.ItemBindingPreviewResponse;
import com.bodhpsychometric.dto.ItemBindingPreviewResponse.QuestionOption;
import com.bodhpsychometric.dto.ItemBindingPreviewResponse.Row;
import com.bodhpsychometric.dto.ItemBindingResponse;
import com.bodhpsychometric.dto.ItemMasterImportRequest;
import com.bodhpsychometric.exception.NotFoundException;
import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.model.report.ReportItemBinding;
import com.bodhpsychometric.model.report.ReportRule;
import com.bodhpsychometric.model.report.ReportRuleVersion;
import com.bodhpsychometric.model.taxonomy.MeasuredQuality;
import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityRepository;
import com.bodhpsychometric.repository.measures.MeasuredQualityTypeRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.report.ReportItemBindingRepository;
import com.bodhpsychometric.repository.report.ReportRuleRepository;
import com.bodhpsychometric.service.report.ItemMasterParser.ParsedItem;
import com.bodhpsychometric.service.report.ItemMasterParser.ParsedItemSheet;
import com.bodhpsychometric.service.report.ItemStatementMatcher.Candidate;
import com.bodhpsychometric.service.report.ItemStatementMatcher.Match;

/**
 * Turning an Items_Master tab into stored bindings.
 *
 * <h2>Two properties, both deliberate</h2>
 *
 * <p><b>Nothing resolves silently.</b> The importer proposes matches and a
 * human confirms them. An item that cannot be matched blocks the import rather
 * than importing unbound, because a partially-bound sheet is worse than none:
 * it produces rules that look translated and quietly omit an item from a sum.
 *
 * <p><b>A re-import updates in place.</b> There is no version history, which is
 * safe only because a binding is authoring-time metadata — item codes are
 * resolved when a rule is TRANSLATED, and the rule version stores the resolved
 * column key. If anything ever starts resolving a binding at report time, that
 * reasoning is void and this needs versioning. See
 * docs/item-master-binding-plan.md §11.2.
 */
@Service
public class ItemBindingService {

    @Autowired private ItemMasterParser parser;
    @Autowired private ReportItemBindingRepository bindings;
    @Autowired private AssessmentRepository assessments;
    @Autowired private QuestionnaireQuestionRepository placements;
    @Autowired private MeasuredQualityRepository qualities;
    @Autowired private MeasuredQualityTypeRepository qualityTypes;
    @Autowired private ReportRuleRepository rules;
    @Autowired private ReportAccess access;

    /* ===================== reading ===================== */

    @Transactional(readOnly = true)
    public List<ItemBindingResponse> listFor(Long assessmentId) {
        access.requireActor();
        return bindings.findByAssessmentIdOrderByAdminPositionAscItemCodeAsc(assessmentId)
                .stream().map(ItemBindingResponse::from).toList();
    }

    /* ===================== preview ===================== */

    @Transactional(readOnly = true)
    public ItemBindingPreviewResponse preview(ItemMasterImportRequest request) {
        // Authoring, not browsing: the preview reads every rule in order to
        // report which ones a delete would orphan.
        access.requireAuthor();

        Assessment assessment = assessments.findById(request.assessmentId())
                .orElseThrow(() -> new NotFoundException("That assessment does not exist."));

        ParsedItemSheet sheet = parser.parse(request.csv());
        List<String> warnings = new ArrayList<>(sheet.warnings());
        List<String> blocking = new ArrayList<>(sheet.blocking());

        List<QuestionnaireQuestion> placed = placements.findInDisplayOrder(
                assessment.getQuestionnaire().getQuestionnaireId());
        List<Candidate> candidates = placed.stream()
                .map(qq -> new Candidate(
                        qq.getQuestion().getQuestionId(),
                        qq.getQuestionnaireQuestionId(),
                        qq.getQuestionTag(),
                        qq.getSortOrder(),
                        qq.getQuestion().getQuestionTexString()))
                .toList();

        if (candidates.isEmpty() && blocking.isEmpty()) {
            blocking.add("This assessment's questionnaire has no questions placed in it, "
                    + "so there is nothing to bind these items to.");
        }

        Map<String, String> statements = new LinkedHashMap<>();
        for (ParsedItem item : sheet.items()) {
            statements.put(item.itemCode(), item.statement());
        }
        Map<String, Match> matches =
                ItemStatementMatcher.matchAll(statements, candidates, request.overrides());

        Taxonomy taxonomy = readTaxonomy();
        Map<String, ReportItemBinding> existing = new LinkedHashMap<>();
        for (ReportItemBinding binding : bindings.findByAssessmentId(request.assessmentId())) {
            existing.put(binding.getItemCode().toLowerCase(Locale.ROOT), binding);
        }

        List<Row> rows = new ArrayList<>();
        int unresolved = 0;
        for (ParsedItem item : sheet.items()) {
            Match match = matches.get(item.itemCode());
            Candidate candidate = match == null ? null : match.candidate();
            if (candidate == null) {
                unresolved++;
            }
            Resolved traits = taxonomy.resolve(item, warnings);
            rows.add(row(item, match, candidate, traits,
                    existing.get(item.itemCode().toLowerCase(Locale.ROOT))));
        }
        if (unresolved > 0) {
            // All or nothing, and said as one line rather than as N separate
            // blockers: a practitioner reading fifteen identical messages
            // learns nothing the count does not already tell them.
            blocking.add(unresolved + " of " + sheet.items().size()
                    + " items could not be matched to a question. Choose a question for each, "
                    + "or correct the statements in the sheet.");
        }

        Set<String> incoming = new LinkedHashSet<>();
        for (ParsedItem item : sheet.items()) {
            incoming.add(item.itemCode().toLowerCase(Locale.ROOT));
        }
        List<String> removed = new ArrayList<>();
        for (ReportItemBinding binding : existing.values()) {
            if (!incoming.contains(binding.getItemCode().toLowerCase(Locale.ROOT))) {
                removed.add(binding.getItemCode());
            }
        }
        blocking.addAll(orphanedRuleComplaints(removed, request.assessmentId()));

        return new ItemBindingPreviewResponse(
                request.assessmentId(),
                rows,
                removed,
                candidates.stream()
                        .map(c -> new QuestionOption(c.questionId(), c.questionTag(),
                                c.sortOrder(), oneLine(c.stem())))
                        .toList(),
                warnings,
                blocking);
    }

    private static Row row(ParsedItem item, Match match, Candidate candidate, Resolved traits,
            ReportItemBinding existing) {
        return new Row(
                item.sheetRow(),
                item.itemCode(),
                item.adminPosition(),
                item.factor(),
                item.construct(),
                item.statement(),
                item.reverseScored(),
                item.inComposite(),
                candidate == null ? null : candidate.questionId(),
                candidate == null ? null : candidate.questionnaireQuestionId(),
                candidate == null ? null : candidate.questionTag(),
                candidate == null ? null : oneLine(candidate.stem()),
                traits.mqId(), traits.mqName(), traits.mqtId(), traits.mqtPath(),
                match == null ? ReportItemBinding.MATCH_NONE : match.method(),
                match == null ? null : match.note(),
                changeOf(item, candidate, traits, existing));
    }

    /**
     * What this import would do to a binding that already exists.
     *
     * <p>Ranked, because a row can be several of these at once and the reviewer
     * needs the most consequential one: a re-match moves what a rule means, a
     * flag change moves what a score means, and everything else is bookkeeping.
     */
    private static String changeOf(ParsedItem item, Candidate candidate, Resolved traits,
            ReportItemBinding existing) {
        if (existing == null) {
            return ItemBindingPreviewResponse.NEW;
        }
        Long proposed = candidate == null ? null : candidate.questionId();
        if (!Objects.equals(existing.getQuestionId(), proposed)) {
            return ItemBindingPreviewResponse.REMATCHED;
        }
        if (existing.isReverseScored() != item.reverseScored()
                || existing.isInComposite() != item.inComposite()) {
            return ItemBindingPreviewResponse.FLAGS_CHANGED;
        }
        if (!Objects.equals(existing.getMqId(), traits.mqId())
                || !Objects.equals(existing.getMqtId(), traits.mqtId())
                || !Objects.equals(existing.getStatement(), item.statement())
                || !Objects.equals(existing.getAdminPosition(), item.adminPosition())) {
            return ItemBindingPreviewResponse.CHANGED;
        }
        return ItemBindingPreviewResponse.UNCHANGED;
    }

    /**
     * Deleting a binding a rule still names.
     *
     * <p>Blocking rather than a warning. The sheet is the authority on which
     * items exist, so a code it no longer contains is deleted — but a rule
     * whose text still says {@code V3} would then be left naming nothing, and
     * would silently stop being translatable. Better to refuse and let somebody
     * decide which of the two is out of date.
     */
    private List<String> orphanedRuleComplaints(List<String> removed, Long assessmentId) {
        if (removed.isEmpty()) {
            return List.of();
        }
        List<String> complaints = new ArrayList<>();
        for (ReportRule rule : rules.findAllWithVersions()) {
            if (!ReportRule.STATUS_ACTIVE.equals(rule.getStatus())) {
                continue;
            }
            if (rule.getAssessmentId() != null
                    && !rule.getAssessmentId().equals(assessmentId)) {
                continue;
            }
            String text = statementOf(rule).toLowerCase(Locale.ROOT);
            if (text.isBlank()) {
                continue;
            }
            for (String code : removed) {
                if (RuleReferenceLint.mentions(text, code.toLowerCase(Locale.ROOT))) {
                    complaints.add("Item \"" + code + "\" is not in this sheet any more, but the "
                            + "rule \"" + rule.getName() + "\" still names it. Remove the rule, "
                            + "reword it, or put the item back in the sheet.");
                }
            }
        }
        return complaints;
    }

    /** The newest version that still says something — a translated rule's text lives on. */
    private static String statementOf(ReportRule rule) {
        return rule.getVersions().stream()
                .sorted(Comparator.comparingInt(ReportRuleVersion::getVersion).reversed())
                .map(ReportRuleVersion::getStatementText)
                .filter(text -> text != null && !text.isBlank())
                .findFirst()
                .orElse("");
    }

    /* ===================== import ===================== */

    /**
     * All or nothing.
     *
     * <p>Everything is checked before anything is written, in the house style,
     * because a loop that returns halfway still COMMITS what it already saved.
     * Here that would leave an assessment whose item codes are half from the
     * new sheet and half from the old one — the one state in which a rule can
     * be translated against a mixture and nobody can see it.
     */
    @Transactional
    public List<ItemBindingResponse> importAll(ItemMasterImportRequest request) {
        ItemBindingPreviewResponse preview = preview(request);
        if (!preview.blocking().isEmpty()) {
            throw new IllegalStateException(preview.blocking().get(0));
        }

        Map<String, ReportItemBinding> existing = new LinkedHashMap<>();
        for (ReportItemBinding binding : bindings.findByAssessmentId(request.assessmentId())) {
            existing.put(binding.getItemCode().toLowerCase(Locale.ROOT), binding);
        }

        List<ReportItemBinding> saved = new ArrayList<>();
        for (Row row : preview.rows()) {
            String key = row.itemCode().toLowerCase(Locale.ROOT);
            ReportItemBinding binding = existing.get(key);
            if (binding == null) {
                binding = new ReportItemBinding();
                binding.setAssessmentId(request.assessmentId());
                binding.setItemCode(row.itemCode());
            }
            binding.setAdminPosition(row.adminPosition());
            binding.setFactorLabel(row.factor());
            binding.setConstructLabel(row.construct());
            binding.setStatement(row.statement());
            binding.setReverseScored(row.reverseScored());
            binding.setInComposite(row.inComposite());
            binding.setQuestionId(row.questionId());
            binding.setQuestionnaireQuestionId(row.questionnaireQuestionId());
            binding.setQuestionTag(row.questionTag());
            binding.setMqId(row.mqId());
            binding.setMqtId(row.mqtId());
            binding.setMatchMethod(row.matchMethod());
            saved.add(binding);
            existing.remove(key);
        }
        bindings.saveAll(saved);

        // Whatever the sheet no longer contains. The preview has already
        // refused this if a rule still names one of them.
        if (!existing.isEmpty()) {
            bindings.deleteAll(existing.values());
        }

        return saved.stream().map(ItemBindingResponse::from).toList();
    }

    /* ===================== taxonomy ===================== */

    /** What a factor/construct pair resolved to. */
    private record Resolved(Long mqId, String mqName, Long mqtId, String mqtPath) {
        static final Resolved NONE = new Resolved(null, null, null, null);
    }

    /**
     * MQs and MQTs by normalised name, read once per preview.
     *
     * <p>The construct is looked up WITHIN the factor's tree, and that is what
     * dissolves this product's standing problem that MQT names are deliberately
     * not unique. "Self-Efficacy" may sit under three different qualities; the
     * sheet says which one, because it names the factor in the next column.
     */
    private Taxonomy readTaxonomy() {
        Map<String, List<MeasuredQuality>> byName = new LinkedHashMap<>();
        for (MeasuredQuality mq : qualities.findAll()) {
            byName.computeIfAbsent(key(mq.getName()), k -> new ArrayList<>()).add(mq);
        }
        return new Taxonomy(byName, qualityTypes.findAll());
    }

    private record Taxonomy(Map<String, List<MeasuredQuality>> qualitiesByName,
            List<MeasuredQualityType> allTypes) {

        Resolved resolve(ParsedItem item, List<String> warnings) {
            if (item.factor() == null && item.construct() == null) {
                return Resolved.NONE;
            }
            MeasuredQuality mq = null;
            if (item.factor() != null) {
                List<MeasuredQuality> hits = qualitiesByName.getOrDefault(
                        key(item.factor()), List.of());
                if (hits.size() == 1) {
                    mq = hits.get(0);
                } else if (hits.isEmpty()) {
                    warnings.add("Item " + item.itemCode() + ": no measured quality is called \""
                            + item.factor() + "\", so rules naming that factor score will not "
                            + "resolve.");
                } else {
                    warnings.add("Item " + item.itemCode() + ": several measured qualities are "
                            + "called \"" + item.factor() + "\", so it was left unresolved.");
                }
            }
            if (item.construct() == null) {
                return mq == null ? Resolved.NONE
                        : new Resolved(mq.getMeasuredQualityId(), mq.getName(), null, null);
            }

            List<MeasuredQualityType> hits = new ArrayList<>();
            for (MeasuredQualityType type : allTypes) {
                if (!key(item.construct()).equals(key(type.getName()))) {
                    continue;
                }
                // Scoped to the factor's tree when we have one. Without that
                // scope a duplicated construct name is ambiguous across the
                // whole installation; with it, it almost never is.
                if (mq != null && !mq.getMeasuredQualityId()
                        .equals(type.getMeasuredQuality().getMeasuredQualityId())) {
                    continue;
                }
                hits.add(type);
            }
            if (hits.size() != 1) {
                warnings.add("Item " + item.itemCode() + ": "
                        + (hits.isEmpty()
                                ? "no trait is called \"" + item.construct() + "\""
                                : "several traits are called \"" + item.construct() + "\"")
                        + (mq == null ? "" : " under \"" + item.factor() + "\"")
                        + ", so it was left unresolved.");
                return mq == null ? Resolved.NONE
                        : new Resolved(mq.getMeasuredQualityId(), mq.getName(), null, null);
            }
            MeasuredQualityType type = hits.get(0);
            MeasuredQuality owner = type.getMeasuredQuality();
            return new Resolved(owner.getMeasuredQualityId(), owner.getName(),
                    type.getMeasuredQualityTypeId(), pathOf(type));
        }
    }

    /** "Internal Drive › Self-Efficacy" — MQT names alone are not identifying. */
    private static String pathOf(MeasuredQualityType type) {
        List<String> parts = new ArrayList<>();
        for (MeasuredQualityType node = type; node != null; node = node.getParent()) {
            parts.add(0, node.getName());
        }
        parts.add(0, type.getMeasuredQuality().getName());
        return String.join(" › ", parts);
    }

    private static String key(String name) {
        return name == null ? "" : name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    /** Stems are rich text; the picker shows one readable line of it. */
    private static String oneLine(String text) {
        if (text == null) {
            return "";
        }
        String flat = text.replaceAll("<[^>]*>", " ").replace("&nbsp;", " ")
                .replaceAll("\\s+", " ").trim();
        return flat.length() <= 160 ? flat : flat.substring(0, 157).trim() + "...";
    }
}
