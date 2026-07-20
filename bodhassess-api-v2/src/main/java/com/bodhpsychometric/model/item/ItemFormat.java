package com.bodhpsychometric.model.item;

/**
 * The eight authoring formats the questionnaire builder offers. FREE_TEXT is
 * the only format valid with zero options; every other format requires at
 * least two (service validation). MATRIX is kept for parity with the old
 * system but its delivery structure is still undesigned — items may carry it,
 * the portal cannot serve it yet.
 */
public enum ItemFormat {
    MCQ,
    RATING_SCALE,
    LIKERT,
    SJT,
    FREE_TEXT,
    IMAGE_CHOICE,
    RANKING,
    MATRIX
}
