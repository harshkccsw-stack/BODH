package com.bodhpsychometric.model.questionnaire;

/**
 * What kind of questionnaire edit a {@link QuestionnaireChangeLog} row
 * records. Closed set by design — extending it is a code change, which keeps
 * log rows machine-interpretable.
 */
public enum QuestionnaireChangeType {
    ITEM_ADDED,
    ITEM_REMOVED,
    ITEM_REPLACED,        // copy-on-write repoint to a new item version
    ITEM_REORDERED,
    OPTION_ORDER_CHANGED,
    SCORE_CHANGED,
    SECTION_CHANGED,
    DEMOGRAPHICS_CHANGED,
    METADATA_UPDATED
}
