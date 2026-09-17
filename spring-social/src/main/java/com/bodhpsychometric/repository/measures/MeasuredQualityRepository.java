package com.bodhpsychometric.repository.measures;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.taxonomy.MeasuredQuality;

public interface MeasuredQualityRepository extends JpaRepository<MeasuredQuality, Long> {

    /**
     * The traits a questionnaire actually measures, for the public product
     * detail page: every MQ that any of its placed questions scores against,
     * reached through the MQT the score points at.
     */
    @Query("select distinct mq.name from MeasuredQuality mq "
            + "join mq.types mqt "
            + "join QuestionMqtScore qms on qms.measuredQualityType = mqt "
            + "join QuestionnaireQuestion qq on qq.question = qms.question "
            + "where qq.questionnaire.questionnaireId = :questionnaireId "
            + "order by mq.name asc")
    List<String> findNamesByQuestionnaireId(@Param("questionnaireId") Long questionnaireId);
}
