package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.question.sheet.TaxonomyPathResolver;
import com.bodhpsychometric.service.question.sheet.TaxonomyPathResolver.Node;
import com.bodhpsychometric.service.question.sheet.TaxonomyPathResolver.Quality;
import com.bodhpsychometric.service.question.sheet.TaxonomyPathResolver.Resolution;
import com.bodhpsychometric.service.question.sheet.TaxonomyPathResolver.Segment;

/**
 * The path rule, tested against the things it exists to get right.
 *
 * <p>Each of these is a way a sheet and a taxonomy can disagree while both look
 * perfectly reasonable. They are the whole reason this is resolved per level
 * rather than by name.
 */
class TaxonomyPathResolverTest {

    private static final String SEP = " › ";

    private static Node node(long id, String name, Node... children) {
        return new Node(id, name, List.of(children));
    }

    /**
     * Two qualities that both contain a "Self-Efficacy", at different depths —
     * which is legal, deliberate, and the shape every interesting case here
     * needs.
     */
    private static List<Quality> taxonomy() {
        return List.of(
                new Quality(7L, "Internal Drive", List.of(
                        node(41L, "Self-Efficacy"),
                        node(42L, "Confidence", node(43L, "Task Belief")))),
                new Quality(9L, "Adaptive Execution", List.of(
                        node(51L, "Proactivity"),
                        node(52L, "Learning Agility", node(53L, "Self-Efficacy")))));
    }

    private static Resolution resolve(String path) {
        return TaxonomyPathResolver.resolve(path, 1, taxonomy());
    }

    /* ===================== the straightforward cases ===================== */

    @Test
    void aPathThatFullyExistsResolvesToItsIds() {
        Resolution r = resolve("Internal Drive" + SEP + "Self-Efficacy");

        assertTrue(r.fullyResolved());
        assertFalse(r.needsPick());
        assertEquals(7L, r.segments().get(0).mqId());
        assertEquals(41L, r.segments().get(1).mqtId());
    }

    @Test
    void aMissingTailIsCreatedUnderTheMatchedPrefix() {
        Resolution r = resolve("Internal Drive" + SEP + "Growth Mindset");

        assertFalse(r.fullyResolved());
        assertTrue(r.segments().get(0).isResolved());
        Segment tail = r.segments().get(1);
        assertEquals(TaxonomyPathResolver.CREATE, tail.status());
        // Anchored to the quality that DID match — this is the partial case,
        // and it must not create a second "Internal Drive" on the way.
        assertEquals(7L, tail.parentMqId());
        assertNull(tail.parentMqtId());
        assertNull(tail.note(), "nothing of this name exists anywhere, so there is nothing to warn about");
        assertNull(tail.suggestedMqtId());
    }

    @Test
    void aPathThatExistsNowhereCreatesTheWholeChain() {
        Resolution r = resolve("Sustained Tenacity" + SEP + "Perseverance");

        assertEquals(TaxonomyPathResolver.CREATE, r.segments().get(0).status());
        assertEquals(TaxonomyPathResolver.CREATE, r.segments().get(1).status());
        assertFalse(r.needsPick());
    }

    @Test
    void caseAndPunctuationDriftStillMatchesButSaysSo() {
        Resolution r = resolve("internal drive" + SEP + "self efficacy");

        assertTrue(r.fullyResolved());
        // Shown apart from an exact match because it is the one kind of match
        // where the name was bent to make it fit.
        assertEquals(TaxonomyPathResolver.MATCHED_NORMALISED, r.segments().get(0).status());
        assertEquals(41L, r.segments().get(1).mqtId());
    }

    /* ===================== the cases the design exists for ===================== */

    @Test
    void theSameNameUnderAnotherQualityIsANewNodeNotThatOne() {
        // "Self-Efficacy" exists — under Adaptive Execution, and nested one
        // level deeper. Reusing it because the NAME matched would score these
        // items into somebody else's construct.
        Resolution r = resolve("Adaptive Execution" + SEP + "Self-Efficacy");

        Segment tail = r.segments().get(1);
        assertEquals(TaxonomyPathResolver.CREATE, tail.status());
        assertEquals(9L, tail.parentMqId());
        assertNotNull(tail.note());
        assertTrue(tail.note().contains("Learning Agility"), tail.note());
        // The note names a node; the screen needs its id to offer "use that
        // one" without a search through every type in the system.
        assertEquals(53L, tail.suggestedMqtId());
        assertEquals("Adaptive Execution" + SEP + "Learning Agility" + SEP + "Self-Efficacy",
                tail.suggestedPath());
    }

    @Test
    void aRootIsNotABranch_sameNameAtAnotherDepthCreatesANewNode() {
        // The sheet says Confidence's child sits at the top of Internal Drive.
        // "Task Belief" exists, but under Confidence. Depth is part of the
        // path: MqtScoringService totals each node's whole subtree, so putting
        // items one level up silently changes what rolls into Confidence.
        Resolution r = resolve("Internal Drive" + SEP + "Task Belief");

        Segment tail = r.segments().get(1);
        assertEquals(TaxonomyPathResolver.CREATE, tail.status());
        assertNotNull(tail.note());
        assertTrue(tail.note().contains("Confidence"), tail.note());
    }

    @Test
    void aPathRootedDeeperThanTheSheetThinksIsCalledOut() {
        // The sheet's TOP column names a construct, not a factor. Left alone
        // this builds a whole parallel "Self-Efficacy" quality beside the real
        // one, with real items in it.
        Resolution r = resolve("Self-Efficacy" + SEP + "Task Confidence");

        Segment root = r.segments().get(0);
        assertEquals(TaxonomyPathResolver.CREATE, root.status());
        assertNotNull(root.note());
        assertTrue(root.note().contains("anchor the path there"), root.note());
        assertTrue(root.note().contains("Internal Drive"), root.note());
        // Re-anchoring rewrites the path to start under this node, so both
        // the id and the full path travel with the segment.
        assertEquals(41L, root.suggestedMqtId());
        assertEquals("Internal Drive" + SEP + "Self-Efficacy", root.suggestedPath());
    }

    @Test
    void twoSiblingsOfTheSameNameResolveToNeither() {
        List<Quality> clashing = List.of(new Quality(7L, "Internal Drive", List.of(
                node(41L, "Self-Efficacy"),
                node(44L, "Self-Efficacy"))));

        Resolution r = TaxonomyPathResolver.resolve("Internal Drive" + SEP + "Self-Efficacy", 1, clashing);

        assertTrue(r.needsPick());
        assertFalse(r.fullyResolved());
        Segment tail = r.segments().get(1);
        assertEquals(TaxonomyPathResolver.AMBIGUOUS, tail.status());
        assertNull(tail.mqtId(), "an ambiguous segment resolves to NOTHING, never to the first one found");
    }

    @Test
    void twoQualitiesOfTheSameNameStopAtTheFirstSegment() {
        List<Quality> clashing = List.of(
                new Quality(7L, "Drive", List.of(node(41L, "A"))),
                new Quality(8L, "Drive", List.of(node(42L, "B"))));

        Resolution r = TaxonomyPathResolver.resolve("Drive" + SEP + "A", 1, clashing);

        assertTrue(r.needsPick());
        assertEquals(1, r.segments().size(), "resolution stops — the rest of the path is meaningless without a root");
    }

    /* ===================== deeper paths ===================== */

    @Test
    void aThreeLevelPathCreatesOnlyWhatIsMissingBelowTheMatch() {
        Resolution r = resolve("Internal Drive" + SEP + "Confidence" + SEP + "Outcome Belief");

        assertEquals(3, r.segments().size());
        assertEquals(7L, r.segments().get(0).mqId());
        assertEquals(42L, r.segments().get(1).mqtId());
        Segment tail = r.segments().get(2);
        assertEquals(TaxonomyPathResolver.CREATE, tail.status());
        // Parented to the TYPE above it, not to the quality — this is the chain
        // the import payload carries as parentTypeRef.
        assertEquals(42L, tail.parentMqtId());
    }

    @Test
    void everythingBelowTheFirstMissIsCreatedEvenIfItExistsElsewhere() {
        // "Self-Efficacy" exists under Internal Drive, but its parent here does
        // not, so it cannot be that one: a node's identity is its position.
        Resolution r = resolve("Internal Drive" + SEP + "New Branch" + SEP + "Self-Efficacy");

        assertEquals(TaxonomyPathResolver.CREATE, r.segments().get(1).status());
        assertEquals(TaxonomyPathResolver.CREATE, r.segments().get(2).status());
        assertNull(r.segments().get(2).mqtId());
    }

    @Test
    void resolveAllKeepsSheetOrderAndQuestionCounts() {
        java.util.LinkedHashMap<String, Integer> counts = new java.util.LinkedHashMap<>();
        counts.put("Internal Drive" + SEP + "Self-Efficacy", 5);
        counts.put("Internal Drive" + SEP + "Growth Mindset", 4);

        List<Resolution> out = TaxonomyPathResolver.resolveAll(counts, taxonomy());

        assertEquals(2, out.size());
        assertEquals(5, out.get(0).questionCount());
        assertEquals(4, out.get(1).questionCount());
    }
}
