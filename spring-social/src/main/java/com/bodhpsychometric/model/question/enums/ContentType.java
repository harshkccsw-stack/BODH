package com.bodhpsychometric.model.question.enums;

/**
 * What a question stem or an option is made of. TEXT lives in the text
 * column; IMAGE and VIDEO are uploaded assets whose location sits in
 * mediaUrl; URL is an externally hosted image or video linked in mediaUrl.
 */
public enum ContentType {
    TEXT,
    IMAGE,
    VIDEO,
    URL
}
