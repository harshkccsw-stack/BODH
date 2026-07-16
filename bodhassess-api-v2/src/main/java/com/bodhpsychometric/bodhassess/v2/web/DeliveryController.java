package com.bodhpsychometric.bodhassess.v2.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.domain.delivery.AssessmentAttempt;
import com.bodhpsychometric.bodhassess.domain.delivery.AssessmentSession;
import com.bodhpsychometric.bodhassess.domain.delivery.AttemptStatus;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionAnswer;
import com.bodhpsychometric.bodhassess.domain.delivery.SessionTraitScore;
import com.bodhpsychometric.bodhassess.domain.service.DeliveryService;
import com.bodhpsychometric.bodhassess.domain.service.DeliveryService.Selection;

@RestController
@RequestMapping("/api/v2/delivery")
public class DeliveryController {

    public record ProvisionRequest(Long assessmentId, Long userId, String language) {}
    public record AnswerRequest(Long itemId, List<Selection> selections, String freeText) {}

    public record SessionDto(Long id, Long assessmentId, Long userId, Long organizationId,
                             Long groupId, String language, Integer liveAttemptNumber,
                             AttemptStatus liveAttemptStatus) {
        static SessionDto from(AssessmentSession s) {
            AssessmentAttempt live = s.getLiveAttempt();
            return new SessionDto(s.getId(), s.getAssessment().getId(), s.getUser().getId(),
                    s.getOrganization() == null ? null : s.getOrganization().getId(),
                    s.getGroup() == null ? null : s.getGroup().getId(),
                    s.getLanguage(),
                    live == null ? null : live.getAttemptNumber(),
                    live == null ? null : live.getStatus());
        }
    }

    public record AttemptDto(Long id, int attemptNumber, AttemptStatus status,
                             String startedAt, String completedAt) {
        static AttemptDto from(AssessmentAttempt a) {
            return new AttemptDto(a.getId(), a.getAttemptNumber(), a.getStatus(),
                    a.getStartedAt() == null ? null : a.getStartedAt().toString(),
                    a.getCompletedAt() == null ? null : a.getCompletedAt().toString());
        }
    }

    public record SelectionDto(Long optionId, Integer rankOrder) {}

    public record AnswerDto(Long id, Long itemId, String freeText, List<SelectionDto> selections) {
        static AnswerDto from(SessionAnswer a) {
            return new AnswerDto(a.getId(), a.getItem().getId(), a.getFreeText(),
                    a.getSelectedOptions().stream()
                            .map(s -> new SelectionDto(s.getOption().getId(), s.getRankOrder()))
                            .toList());
        }
    }

    public record ResultDto(Long placementId, Long traitId, String traitName, Long measuredQualityId,
                            double value) {
        static ResultDto from(SessionTraitScore s) {
            return new ResultDto(s.getPlacement().getId(), s.getPlacement().getTrait().getId(),
                    s.getPlacement().getTrait().getName(),
                    s.getPlacement().getMeasuredQuality().getId(), s.getValue());
        }
    }

    private final DeliveryService delivery;

    public DeliveryController(DeliveryService delivery) {
        this.delivery = delivery;
    }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionDto provision(@RequestBody ProvisionRequest body) {
        return SessionDto.from(delivery.provisionSession(body.assessmentId(), body.userId(), body.language()));
    }

    @GetMapping("/sessions/{id}")
    public SessionDto get(@PathVariable Long id) {
        return SessionDto.from(delivery.getSession(id));
    }

    /** RESUME included — partial answers of the live attempt come back via GET answers. */
    @PostMapping("/sessions/{id}/start")
    public AttemptDto startOrResume(@PathVariable Long id) {
        return AttemptDto.from(delivery.startOrResume(id));
    }

    @GetMapping("/sessions/{id}/answers")
    public List<AnswerDto> answers(@PathVariable Long id) {
        return delivery.answersOfLiveAttempt(id).stream().map(AnswerDto::from).toList();
    }

    @PutMapping("/sessions/{id}/answers")
    public AnswerDto saveAnswer(@PathVariable Long id, @RequestBody AnswerRequest body) {
        return AnswerDto.from(delivery.saveAnswer(id, body.itemId(), body.selections(), body.freeText()));
    }

    /** Server-side scoring happens here; the result is frozen. */
    @PostMapping("/sessions/{id}/submit")
    public AttemptDto submit(@PathVariable Long id) {
        return AttemptDto.from(delivery.submit(id));
    }

    @GetMapping("/sessions/{id}/results")
    public List<ResultDto> results(@PathVariable Long id) {
        return delivery.resultsOfLiveAttempt(id).stream().map(ResultDto::from).toList();
    }

    /** Admin RESET: archives the live attempt (nothing wiped), spawns the next. */
    @PostMapping("/sessions/{id}/reset")
    public AttemptDto reset(@PathVariable Long id) {
        return AttemptDto.from(delivery.reset(id));
    }
}
