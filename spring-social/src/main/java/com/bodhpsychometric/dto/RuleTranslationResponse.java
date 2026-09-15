package com.bodhpsychometric.dto;

import java.util.List;

/**
 * What the model proposes. <b>Nothing here is saved.</b>
 *
 * <p>Every proposal has already been through the same validator the save path
 * uses, so {@code ok} is not the model's opinion of its own work — it is the
 * parser's. A proposal that did not validate is still returned, with the
 * validator's complaint attached, because seeing the attempt and why it failed
 * is more useful to the person fixing it than being told nothing came back.
 *
 * @param model which model answered, so a disappointing batch can be traced to
 *        the model that produced it rather than blamed on the feature.
 */
public record RuleTranslationResponse(
        String model,
        List<Proposal> proposals) {

    /**
     * @param ok the proposed expression parses and every name in it resolves.
     *        Only an ok proposal may be applied.
     * @param errors the validator's own words when it did not.
     * @param note the model's account of what it assumed or could not do.
     *        Present on confident proposals too — an assumption worth stating
     *        is worth reading before accepting the formula that rests on it.
     * @param confident the model's own judgement. A false here with no errors
     *        means the formula parses but the model doubts it means the right
     *        thing, which is precisely the case a human has to settle.
     * @param warnings what the validator found suspect in a formula it
     *        nonetheless accepted — a threshold no respondent can reach, above
     *        all. These matter MORE here than on a hand-written rule, not less:
     *        a proposal arrives with a tick beside it, and the tick only ever
     *        meant "parses and resolves". Reaching for a column when a rule was
     *        meant is the model's characteristic mistake, and it produces
     *        exactly this shape of dead threshold.
     */
    public record Proposal(
            Long reportRuleId,
            String name,
            String sourceText,
            String expression,
            String resultType,
            boolean ok,
            boolean confident,
            List<String> errors,
            String note,
            List<String> warnings) {
    }
}
