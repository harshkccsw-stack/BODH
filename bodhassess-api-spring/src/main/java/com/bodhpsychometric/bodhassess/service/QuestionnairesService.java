package com.bodhpsychometric.bodhassess.service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.bodhpsychometric.bodhassess.exception.BadRequestException;
import com.bodhpsychometric.bodhassess.exception.ResourceNotFoundException;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaire;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaireMq;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaireMqt;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaireQuestion;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaireQuestionOption;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaireQuestionOptionScore;
import com.bodhpsychometric.bodhassess.model.PublishedQuestionnaireQuestionScore;
import com.bodhpsychometric.bodhassess.model.Questionnaire;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireDto;
import com.bodhpsychometric.bodhassess.payload.QuestionnaireSummaryDto;
import com.bodhpsychometric.bodhassess.repository.PublishedQuestionnaireRepository;
import com.bodhpsychometric.bodhassess.repository.QuestionnaireRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

@Service
@Transactional
public class QuestionnairesService {

    @Autowired
    private PublishedQuestionnaireRepository repo;

    @Autowired
    private QuestionnaireRepository parents;

    @Transactional(readOnly = true)
    public List<QuestionnaireDto> list(String vertical) {
        List<PublishedQuestionnaire> rows = StringUtils.hasText(vertical)
                ? repo.findByVertical(vertical)
                : repo.findAllOrderByCreated();
        return rows.stream().map(this::toDto).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<QuestionnaireSummaryDto> listSummaries(String vertical) {
        return StringUtils.hasText(vertical)
                ? repo.findSummariesByVertical(vertical)
                : repo.findAllSummariesOrderByCreated();
    }

    @Transactional(readOnly = true)
    public QuestionnaireDto get(String id) {
        return toDto(repo.findById(id).orElseThrow(() -> new ResourceNotFoundException("Questionnaire", "id", id)));
    }

    @Transactional(readOnly = true)
    public QuestionnaireDto getByName(String name) {
        if (!StringUtils.hasText(name)) throw new BadRequestException("name query param required");
        List<PublishedQuestionnaire> hits = repo.findByName(name);
        if (hits.isEmpty()) throw new ResourceNotFoundException("Questionnaire", "name", name);
        return toDto(hits.get(0));
    }

    /**
     * Idempotent on both id and name so re-publishes overwrite cleanly. We
     * first delete any other row holding this name, then upsert by id.
     *
     * Note: deleting via repo.delete(entity) instead of a bulk JPQL DELETE is
     * required — the child tables (mqs, questions, languages,
     * demographicFieldKeys) hold FKs back to published_questionnaires, and
     * only the entity-level remove fires the cascade/orphanRemoval that
     * clears them first.
     */
    public QuestionnaireDto upsert(QuestionnaireDto dto) {
        if (!StringUtils.hasText(dto.getId()) || !StringUtils.hasText(dto.getName())) {
            throw new BadRequestException("id and name are required");
        }
        // Lock: a COMMITTED version is immutable. To "edit", admin must
        // create a new draft via the versioning service. Existing rows
        // pre-migration are already marked COMMITTED, so this guard
        // applies uniformly — there's no back-door to mutate a row
        // that's locked in by live assessments.
        repo.findById(dto.getId().trim()).ifPresent(existing -> {
            if ("COMMITTED".equals(existing.getVersionStatus())) {
                throw new BadRequestException(
                        "This questionnaire version is locked (committed). "
                        + "Create a new draft from it to make changes.");
            }
        });
        for (PublishedQuestionnaire dup : repo.findOthersByName(dto.getName().trim(), dto.getId().trim())) {
            repo.delete(dup);
        }
        // Flush so the parent rows (and their cascaded children) are gone
        // before we save the new/updated row under the kept id. Without this
        // the upsert's INSERT can race the cascade's DELETEs in one tx and
        // re-trip the same FK that motivated this change.
        repo.flush();

        PublishedQuestionnaire q = repo.findById(dto.getId()).orElseGet(PublishedQuestionnaire::new);
        q.setId(dto.getId());
        q.setName(dto.getName().trim());
        q.setShortName(dto.getShortName());
        q.setVertical(dto.getVertical());
        q.setCategory(dto.getCategory());
        q.setDescription(dto.getDescription());
        q.setDuration(dto.getDuration());
        q.setTier(dto.getTier());
        q.setLanguages(dto.getLanguages() == null ? new HashSet<>() : new HashSet<>(dto.getLanguages()));
        applyMqsFromJson(q, dto.getMqs());
        applyQuestionsFromJson(q, dto.getQuestions());
        q.setDemo(dto.isDemo());
        q.setDisclaimer(dto.getDisclaimer());
        q.setInstructions(dto.getInstructions());
        q.setShowInstructions(dto.isShowInstructions());
        q.setDemographicFieldKeys(dto.getDemographicFieldKeys() == null ? new HashSet<>() : new HashSet<>(dto.getDemographicFieldKeys()));
        PublishedQuestionnaire saved = repo.save(q);

        // The wizard publishes land here as standalone COMMITTED rows. The
        // versioning model — and the assessment-create questionnaire/version
        // pickers — require every version to hang off a parent Questionnaire.
        // Create one on the spot for parent-less rows so the questionnaire is
        // immediately pickable, instead of being invisible until the boot-time
        // QuestionnaireVersioningMigrationRunner backfills it. Mirrors that
        // runner's field choices so the two paths stay consistent.
        if (!StringUtils.hasText(saved.getParentId())) {
            Questionnaire p = new Questionnaire();
            p.setId("Q-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
            p.setName(saved.getName());
            p.setVertical(saved.getVertical());
            p.setCurrentVersionId(saved.getId());
            p.setCreatedBy("wizard-publish");
            parents.save(p);

            saved.setParentId(p.getId());
            if (saved.getVersionMajor() == 0 && saved.getVersionMinor() == 0) saved.setVersionMajor(1);
            if (!StringUtils.hasText(saved.getVersionLabel())) saved.setVersionLabel("v1.0");
            if (!StringUtils.hasText(saved.getVersionStatus())) saved.setVersionStatus("COMMITTED");
            if (saved.getCommittedAt() == null) saved.setCommittedAt(OffsetDateTime.now(ZoneOffset.UTC));
            if (!StringUtils.hasText(saved.getCommittedBy())) saved.setCommittedBy("wizard-publish");
            saved = repo.save(saved);
        }
        return toDto(saved);
    }

    public void delete(String id) {
        if (repo.existsById(id)) repo.deleteById(id);
    }

    private QuestionnaireDto toDto(PublishedQuestionnaire q) {
        QuestionnaireDto d = new QuestionnaireDto();
        d.setId(q.getId());
        d.setName(q.getName());
        d.setShortName(q.getShortName());
        d.setVertical(q.getVertical());
        d.setCategory(q.getCategory());
        d.setDescription(q.getDescription());
        d.setDuration(q.getDuration());
        d.setTier(q.getTier());
        d.setLanguages(q.getLanguages() == null ? new ArrayList<>() : new ArrayList<>(q.getLanguages()));
        d.setMqs(mqsToJson(q));
        d.setQuestions(questionsToJson(q));
        d.setDemo(q.isDemo());
        d.setDisclaimer(q.getDisclaimer());
        d.setInstructions(q.getInstructions());
        d.setShowInstructions(q.isShowInstructions());
        d.setDemographicFieldKeys(q.getDemographicFieldKeys() == null ? new ArrayList<>() : new ArrayList<>(q.getDemographicFieldKeys()));
        if (q.getCreatedAt() != null) d.setCreatedAt(q.getCreatedAt().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME));
        return d;
    }

    // ---------- MQ tree conversion ----------

    /**
     * Rebuild the snapshot MQ tree from the incoming JSON. orphanRemoval +
     * cascade on the entity handle deleting anything not in the new tree.
     */
    private void applyMqsFromJson(PublishedQuestionnaire q, JsonNode mqsJson) {
        q.getMqs().clear();
        if (mqsJson == null || !mqsJson.isArray()) return;
        int idx = 0;
        for (JsonNode mqNode : mqsJson) {
            if (mqNode == null || !mqNode.isObject()) { idx++; continue; }
            PublishedQuestionnaireMq mq = new PublishedQuestionnaireMq();
            mq.setQuestionnaire(q);
            mq.setMqId(textOrEmpty(mqNode, "id"));
            mq.setName(textOrNull(mqNode, "name"));
            mq.setSortOrder(idx++);
            JsonNode mqtsNode = mqNode.get("mqts");
            if (mqtsNode != null && mqtsNode.isArray()) {
                int childIdx = 0;
                for (JsonNode childNode : mqtsNode) {
                    PublishedQuestionnaireMqt childMqt = buildMqt(mq, null, childNode, childIdx++);
                    if (childMqt != null) mq.getMqts().add(childMqt);
                }
            }
            q.getMqs().add(mq);
        }
    }

    private PublishedQuestionnaireMqt buildMqt(PublishedQuestionnaireMq mq, PublishedQuestionnaireMqt parent,
                                               JsonNode node, int sortOrder) {
        if (node == null || !node.isObject()) return null;
        PublishedQuestionnaireMqt m = new PublishedQuestionnaireMqt();
        m.setMq(mq);
        m.setParent(parent);
        m.setMqtId(textOrEmpty(node, "id"));
        m.setName(textOrNull(node, "name"));
        m.setSortOrder(sortOrder);
        JsonNode kids = node.get("children");
        if (kids != null && kids.isArray()) {
            int idx = 0;
            for (JsonNode k : kids) {
                PublishedQuestionnaireMqt child = buildMqt(mq, m, k, idx++);
                if (child != null) m.getChildren().add(child);
            }
        }
        return m;
    }

    private ArrayNode mqsToJson(PublishedQuestionnaire q) {
        ArrayNode out = JsonNodeFactory.instance.arrayNode();
        if (q.getMqs() == null) return out;
        for (PublishedQuestionnaireMq mq : q.getMqs()) {
            ObjectNode mqNode = JsonNodeFactory.instance.objectNode();
            mqNode.put("id", mq.getMqId());
            mqNode.put("name", mq.getName());
            ArrayNode children = JsonNodeFactory.instance.arrayNode();
            for (PublishedQuestionnaireMqt child : mq.getMqts()) {
                children.add(mqtToJson(child));
            }
            mqNode.set("mqts", children);
            out.add(mqNode);
        }
        return out;
    }

    private ObjectNode mqtToJson(PublishedQuestionnaireMqt m) {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        node.put("id", m.getMqtId());
        node.put("name", m.getName());
        if (m.getChildren() != null && !m.getChildren().isEmpty()) {
            ArrayNode kids = JsonNodeFactory.instance.arrayNode();
            for (PublishedQuestionnaireMqt c : m.getChildren()) kids.add(mqtToJson(c));
            node.set("children", kids);
        }
        return node;
    }

    // ---------- Questions snapshot conversion ----------

    private void applyQuestionsFromJson(PublishedQuestionnaire q, JsonNode qsJson) {
        q.getQuestions().clear();
        if (qsJson == null || !qsJson.isArray()) return;
        int idx = 0;
        for (JsonNode qNode : qsJson) {
            if (qNode == null || !qNode.isObject()) { idx++; continue; }
            PublishedQuestionnaireQuestion question = new PublishedQuestionnaireQuestion();
            question.setQuestionnaire(q);
            question.setSnapshotQuestionId(textOrEmpty(qNode, "id"));
            question.setStem(textOrNull(qNode, "stem"));
            question.setFormat(textOrNull(qNode, "format"));
            question.setMediaUrl(textOrNull(qNode, "media_url"));
            question.setMediaType(textOrNull(qNode, "media_type"));
            question.setClinicalRiskFlag(qNode.path("clinical_risk_flag").asBoolean(false));
            question.setRiskFlagRule(textOrNull(qNode, "risk_flag_rule"));
            question.setSectionId(textOrNull(qNode, "sectionId"));
            question.setSectionTitle(textOrNull(qNode, "sectionTitle"));
            question.setSortOrder(idx++);

            JsonNode opts = qNode.get("options");
            if (opts != null && opts.isArray()) {
                int oi = 0;
                for (JsonNode optNode : opts) {
                    if (optNode == null || !optNode.isObject()) { oi++; continue; }
                    PublishedQuestionnaireQuestionOption opt = new PublishedQuestionnaireQuestionOption();
                    opt.setQuestion(question);
                    opt.setSortOrder(oi++);
                    opt.setText(textOrNull(optNode, "text"));
                    opt.setMediaUrl(textOrNull(optNode, "media_url"));
                    opt.setMediaType(textOrNull(optNode, "media_type"));
                    JsonNode scores = optNode.get("scores");
                    if (scores != null && scores.isArray()) {
                        for (JsonNode s : scores) {
                            if (s == null || !s.isObject() || !s.hasNonNull("mqt_id")) continue;
                            PublishedQuestionnaireQuestionOptionScore os = new PublishedQuestionnaireQuestionOptionScore();
                            os.setOption(opt);
                            os.setMqtId(s.get("mqt_id").asText());
                            os.setScore(s.path("score").asDouble(0));
                            opt.getScores().add(os);
                        }
                    }
                    question.getOptions().add(opt);
                }
            }

            JsonNode qScores = qNode.get("question_scores");
            if (qScores != null && qScores.isArray()) {
                for (JsonNode s : qScores) {
                    if (s == null || !s.isObject() || !s.hasNonNull("mqt_id")) continue;
                    PublishedQuestionnaireQuestionScore qs = new PublishedQuestionnaireQuestionScore();
                    qs.setQuestion(question);
                    qs.setMqtId(s.get("mqt_id").asText());
                    qs.setScore(s.path("score").asDouble(0));
                    question.getQuestionScores().add(qs);
                }
            }
            q.getQuestions().add(question);
        }
    }

    private ArrayNode questionsToJson(PublishedQuestionnaire q) {
        ArrayNode out = JsonNodeFactory.instance.arrayNode();
        if (q.getQuestions() == null) return out;
        for (PublishedQuestionnaireQuestion question : q.getQuestions()) {
            ObjectNode qNode = JsonNodeFactory.instance.objectNode();
            qNode.put("id", question.getSnapshotQuestionId());
            qNode.put("stem", question.getStem());
            qNode.put("format", question.getFormat());
            qNode.put("media_url", question.getMediaUrl());
            qNode.put("media_type", question.getMediaType());
            qNode.put("clinical_risk_flag", question.isClinicalRiskFlag());
            qNode.put("risk_flag_rule", question.getRiskFlagRule());
            if (question.getSectionId() != null) qNode.put("sectionId", question.getSectionId());
            if (question.getSectionTitle() != null) qNode.put("sectionTitle", question.getSectionTitle());

            ArrayNode opts = JsonNodeFactory.instance.arrayNode();
            for (PublishedQuestionnaireQuestionOption opt : question.getOptions()) {
                ObjectNode optNode = JsonNodeFactory.instance.objectNode();
                optNode.put("text", opt.getText());
                if (opt.getMediaUrl() != null) optNode.put("media_url", opt.getMediaUrl());
                if (opt.getMediaType() != null) optNode.put("media_type", opt.getMediaType());
                ArrayNode scoreArr = JsonNodeFactory.instance.arrayNode();
                for (PublishedQuestionnaireQuestionOptionScore s : opt.getScores()) {
                    ObjectNode sn = JsonNodeFactory.instance.objectNode();
                    sn.put("mqt_id", s.getMqtId());
                    sn.put("score", s.getScore());
                    scoreArr.add(sn);
                }
                optNode.set("scores", scoreArr);
                opts.add(optNode);
            }
            qNode.set("options", opts);

            ArrayNode qScores = JsonNodeFactory.instance.arrayNode();
            for (PublishedQuestionnaireQuestionScore s : question.getQuestionScores()) {
                ObjectNode sn = JsonNodeFactory.instance.objectNode();
                sn.put("mqt_id", s.getMqtId());
                sn.put("score", s.getScore());
                qScores.add(sn);
            }
            qNode.set("question_scores", qScores);

            out.add(qNode);
        }
        return out;
    }

    private static String textOrEmpty(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? "" : v.asText();
    }

    private static String textOrNull(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }
}
