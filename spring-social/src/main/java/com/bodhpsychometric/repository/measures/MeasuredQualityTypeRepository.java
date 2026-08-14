package com.bodhpsychometric.repository.measures;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.taxonomy.MeasuredQualityType;

public interface MeasuredQualityTypeRepository extends JpaRepository<MeasuredQualityType, Long> {

    /**
     * Scoring-plan fetch — the WHOLE tree of every MQ that any of these MQTs
     * belongs to, with the MQ and the parent joined in.
     *
     * The whole forest rather than just the ids asked for, because a subtree
     * total needs the ancestors of a scored node even when nothing scores on
     * them, and a path label needs every link up to the root. These trees are
     * small (a questionnaire spans a handful of MQs), so one query beats
     * walking parents one at a time.
     */
    @Query("select distinct t from MeasuredQualityType t "
            + "join fetch t.measuredQuality mq left join fetch t.parent "
            + "where mq.measuredQualityId in "
            + "(select t2.measuredQuality.measuredQualityId from MeasuredQualityType t2 "
            + "where t2.measuredQualityTypeId in :measuredQualityTypeIds)")
    List<MeasuredQualityType> findForestOf(Collection<Long> measuredQualityTypeIds);
}
