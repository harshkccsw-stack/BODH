package com.bodhpsychometric.service;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.bodhpsychometric.dto.BaselineAnswerSyncRequest;
import com.bodhpsychometric.dto.BaselineAnswerSyncResponse;
import com.bodhpsychometric.dto.BaselineQuestionResponse;
import com.bodhpsychometric.dto.BaselineQuestionSyncRequest;
import com.bodhpsychometric.dto.MemoryMeshRespondentSyncResponse;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.baseline.BaselineAnswer;
import com.bodhpsychometric.model.baseline.BaselineQuestion;
import com.bodhpsychometric.repository.auth.RespondentUserRepository;
import com.bodhpsychometric.repository.baseline.BaselineAnswerRepository;
import com.bodhpsychometric.repository.baseline.BaselineQuestionRepository;

/**
 * The baseline as MemoryMesh mirrors it here: the questions (replace-all,
 * keyed by this side's ids, ordered by array index) and each respondent's
 * answers (upsert, one row per question).
 *
 * <p>A question that has been answered cannot be removed — retire it with
 * {@code active=false} instead. Pass 1 validates everything, pass 2 writes.
 */
@Service
public class BaselineSyncService {

    private static final int TEXT_MAX = 1000;

    private final BaselineQuestionRepository questions;
    private final BaselineAnswerRepository answers;
    private final RespondentUserRepository respondents;
    private final MemoryMeshSyncService respondentSync;

    public BaselineSyncService(BaselineQuestionRepository questions, BaselineAnswerRepository answers,
            RespondentUserRepository respondents, MemoryMeshSyncService respondentSync) {
        this.questions = questions;
        this.answers = answers;
        this.respondents = respondents;
        this.respondentSync = respondentSync;
    }

    @Transactional(readOnly = true)
    public List<BaselineQuestionResponse> list() {
        return questions.findAllByOrderBySortOrderAsc().stream().map(BaselineQuestionResponse::from).toList();
    }

    @Transactional
    public List<BaselineQuestionResponse> replace(List<BaselineQuestionSyncRequest> requests) {
        List<BaselineQuestionSyncRequest> incoming = requests == null ? List.of() : requests;
        Map<Long, BaselineQuestion> existing = new HashMap<>();
        for (BaselineQuestion q : questions.findAll()) {
            existing.put(q.getBaselineQuestionId(), q);
        }

        Set<Long> seen = new HashSet<>();
        int row = 0;
        for (BaselineQuestionSyncRequest r : incoming) {
            row++;
            String text = r.text() == null ? "" : r.text().trim();
            if (text.isEmpty()) {
                throw bad("Question " + row + " has no text");
            }
            if (text.length() > TEXT_MAX) {
                throw bad("Question " + row + " is longer than " + TEXT_MAX + " characters");
            }
            if (r.active() == null) {
                throw bad("Question " + row + " must say whether it is active");
            }
            if (r.baselineQuestionId() != null) {
                if (!existing.containsKey(r.baselineQuestionId())) {
                    throw bad("Question " + row + " refers to an id that does not exist");
                }
                if (!seen.add(r.baselineQuestionId())) {
                    throw bad("Question " + row + " appears twice");
                }
            }
        }
        for (BaselineQuestion q : existing.values()) {
            if (!seen.contains(q.getBaselineQuestionId())
                    && answers.existsByQuestion_BaselineQuestionId(q.getBaselineQuestionId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "“" + q.getText()
                        + "” has already been answered by respondents and cannot be removed — retire it instead");
            }
        }

        for (BaselineQuestion q : existing.values()) {
            if (!seen.contains(q.getBaselineQuestionId())) {
                questions.delete(q);
            }
        }
        int index = 0;
        for (BaselineQuestionSyncRequest r : incoming) {
            BaselineQuestion q = r.baselineQuestionId() == null
                    ? new BaselineQuestion()
                    : existing.get(r.baselineQuestionId());
            q.setText(r.text().trim());
            q.setActive(r.active());
            q.setSortOrder(index++);
            questions.save(q);
        }
        questions.flush();
        return list();
    }

    /**
     * Find-or-create the person (the respondent mirror's rules), then upsert
     * their answers. Inactive questions still accept an answer: MemoryMesh may
     * be a little behind on which are retired, and an honest answer to a
     * question that was asked is not something to refuse.
     */
    @Transactional
    public BaselineAnswerSyncResponse storeAnswers(BaselineAnswerSyncRequest request) {
        MemoryMeshRespondentSyncResponse who = respondentSync.sync(request.respondent());
        RespondentUser respondent = respondents.findById(who.respondentUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Respondent not found"));

        Map<Long, BaselineQuestion> byId = new HashMap<>();
        for (BaselineQuestion q : questions.findAll()) {
            byId.put(q.getBaselineQuestionId(), q);
        }
        List<BaselineAnswerSyncRequest.Answer> incoming =
                request.answers() == null ? List.of() : request.answers();
        Map<Long, Integer> said = new HashMap<>();
        for (BaselineAnswerSyncRequest.Answer a : incoming) {
            if (a.baselineQuestionId() == null || !byId.containsKey(a.baselineQuestionId())) {
                throw bad("An answer refers to a question that does not exist here");
            }
            if (a.value() == null || a.value() < BaselineAnswer.MIN_VALUE || a.value() > BaselineAnswer.MAX_VALUE) {
                throw bad("Every answer must be a number from " + BaselineAnswer.MIN_VALUE
                        + " to " + BaselineAnswer.MAX_VALUE);
            }
            if (said.put(a.baselineQuestionId(), a.value()) != null) {
                throw bad("A question was answered twice in one request");
            }
        }

        Map<Long, BaselineAnswer> existing = new HashMap<>();
        for (BaselineAnswer a : answers.findByRespondentWithQuestion(respondent.getId())) {
            existing.put(a.getQuestion().getBaselineQuestionId(), a);
        }
        OffsetDateTime now = OffsetDateTime.now();
        for (Map.Entry<Long, Integer> e : said.entrySet()) {
            BaselineAnswer a = existing.get(e.getKey());
            if (a == null) {
                a = new BaselineAnswer();
                a.setRespondent(respondent);
                a.setQuestion(byId.get(e.getKey()));
            }
            a.setAnswerValue(e.getValue());
            a.setRecordedAt(now);
            answers.save(a);
        }
        answers.flush();
        return new BaselineAnswerSyncResponse(respondent.getId(), who.serialId(), said.size());
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
