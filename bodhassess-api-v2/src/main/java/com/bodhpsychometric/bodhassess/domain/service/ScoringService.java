package com.bodhpsychometric.bodhassess.domain.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.delivery.AssessmentAttempt;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionAnswer;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionAnswerOption;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionTraitScore;
import com.bodhpsychometric.bodhassess.domain.questionnaire.ItemUsageTraitScore;
import com.bodhpsychometric.bodhassess.domain.questionnaire.OptionUsageTraitScore;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItem;
import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItemOption;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireItemOptionRepository;
import com.bodhpsychometric.bodhassess.domain.repository.QuestionnaireItemRepository;
import com.bodhpsychometric.bodhassess.domain.repository.SessionAnswerRepository;
import com.bodhpsychometric.bodhassess.domain.taxonomy.TraitPlacement;

/**
 * SERVER-side scoring, computed once at submit and frozen as
 * SessionTraitScore rows (the client never supplies scores — that hole is
 * closed). Question-level credits count once per answered item; option-level
 * credits count per selected option (multi-select sums; RANKING currently
 * sums selected options too — rank-weighted scoring is a product decision
 * that can slot in here later).
 */
@Service
@Transactional
public class ScoringService {

    private final SessionAnswerRepository answerRepository;
    private final QuestionnaireItemRepository usageRepository;
    private final QuestionnaireItemOptionRepository optionUsageRepository;

    public ScoringService(SessionAnswerRepository answerRepository,
                          QuestionnaireItemRepository usageRepository,
                          QuestionnaireItemOptionRepository optionUsageRepository) {
        this.answerRepository = answerRepository;
        this.usageRepository = usageRepository;
        this.optionUsageRepository = optionUsageRepository;
    }

    /** Computes and attaches the frozen result rows for this attempt. */
    public void scoreAttempt(AssessmentAttempt attempt, Long questionnaireId) {
        Map<Long, Accumulator> byPlacement = new LinkedHashMap<>();

        List<SessionAnswer> answers = answerRepository.findWithSelectionsByAttemptId(attempt.getId());
        for (SessionAnswer answer : answers) {
            QuestionnaireItem usage = usageRepository
                    .findByQuestionnaireIdAndItemId(questionnaireId, answer.getItem().getId())
                    .orElse(null);
            if (usage == null) {
                // Item was removed from the questionnaire after this answer was
                // saved — the answer stays (history), it just no longer scores.
                continue;
            }
            for (ItemUsageTraitScore credit : usage.getTraitScores()) {
                accumulate(byPlacement, credit.getPlacement(), credit.getValue());
            }
            for (SessionAnswerOption selection : answer.getSelectedOptions()) {
                QuestionnaireItemOption optionUsage = optionUsageRepository
                        .findByUsageIdAndOptionId(usage.getId(), selection.getOption().getId())
                        .orElse(null);
                if (optionUsage == null) continue;
                for (OptionUsageTraitScore credit : optionUsage.getTraitScores()) {
                    accumulate(byPlacement, credit.getPlacement(), credit.getValue());
                }
            }
        }

        for (Accumulator acc : byPlacement.values()) {
            SessionTraitScore score = new SessionTraitScore();
            score.setPlacement(acc.placement);
            score.setValue(acc.total);
            attempt.addTraitScore(score);
        }
    }

    private static void accumulate(Map<Long, Accumulator> byPlacement, TraitPlacement placement, double value) {
        byPlacement.computeIfAbsent(placement.getId(), id -> new Accumulator(placement)).total += value;
    }

    private static final class Accumulator {
        final TraitPlacement placement;
        double total;

        Accumulator(TraitPlacement placement) {
            this.placement = placement;
        }
    }
}
