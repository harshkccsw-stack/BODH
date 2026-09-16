package com.bodhpsychometric.service.question.sheet;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A taxonomy path from a sheet — {@code Internal Drive › Self-Efficacy} — against
 * the qualities that actually exist. Pure and static, so the rule can be tested
 * against the cases it exists to get right rather than against a happy path.
 *
 * <h2>The rule</h2>
 *
 * Resolve left to right; stop at the first segment that does not match; every
 * segment from there down is created under the last one that did. Longest
 * matched prefix, and nothing else.
 *
 * <h2>Why each segment is matched only against its parent's children</h2>
 *
 * MQT names are deliberately not unique across the taxonomy — a
 * {@code Self-Efficacy} under {@code Internal Drive} and one under
 * {@code Adaptive Execution} are different constructs that share a word. Matching
 * per level means the sheet's own parent disambiguates them, and it means a node
 * at a DIFFERENT DEPTH is never a candidate. That second consequence is the one
 * worth stating: {@code MqtScoringService} totals each node's whole subtree, so
 * attaching items one level from where they belong silently changes what rolls
 * up, and every report built on it is confidently wrong.
 *
 * <h2>Ambiguity resolves to nothing</h2>
 *
 * Two siblings of the same name resolve to neither. An unresolved path is one
 * click to fix; a confidently wrong one mis-scores an instrument for its life.
 */
public final class TaxonomyPathResolver {

    private TaxonomyPathResolver() {
    }

    /* ===================== the taxonomy, as this needs it ===================== */

    public record Node(Long id, String name, List<Node> children) {
    }

    public record Quality(Long id, String name, List<Node> roots) {
    }

    /* ===================== the answer ===================== */

    public static final String MATCHED = "MATCHED";
    public static final String MATCHED_NORMALISED = "MATCHED_NORMALISED";
    public static final String CREATE = "CREATE";
    public static final String AMBIGUOUS = "AMBIGUOUS";

    /**
     * One segment of one path. {@code mqId} is set when the segment IS a
     * measured quality (the first segment); {@code mqtId} when it is a type.
     * Both null on CREATE and AMBIGUOUS.
     */
    public record Segment(
            String name,
            String status,
            Long mqId,
            Long mqtId,
            /** Parent to create under — the MQ for the first type, else the type above. */
            Long parentMqId,
            Long parentMqtId,
            /** A near miss worth a reviewer's attention, or null. */
            String note,
            /**
             * The node the note is about, so a screen can act on it in one click:
             * for a name found elsewhere, the type to use instead; for a path
             * rooted deeper than the sheet thinks, the type to anchor under.
             */
            Long suggestedMqtId,
            String suggestedPath) {

        public boolean isResolved() {
            return MATCHED.equals(status) || MATCHED_NORMALISED.equals(status);
        }
    }

    public record Resolution(
            String pathKey,
            List<Segment> segments,
            int questionCount,
            /** True when no segment is AMBIGUOUS and nothing needs creating. */
            boolean fullyResolved,
            /** True when a segment could not be decided and a human must pick. */
            boolean needsPick) {
    }

    /* ===================== entry point ===================== */

    /**
     * @param pathCounts path key → how many questions use it, in first-seen order
     * @param taxonomy   every measured quality with its whole tree
     */
    public static List<Resolution> resolveAll(Map<String, Integer> pathCounts, List<Quality> taxonomy) {
        List<Resolution> out = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : pathCounts.entrySet()) {
            out.add(resolve(entry.getKey(), entry.getValue(), taxonomy));
        }
        return out;
    }

    public static Resolution resolve(String pathKey, int questionCount, List<Quality> taxonomy) {
        List<String> names = splitPath(pathKey);
        List<Segment> segments = new ArrayList<>();
        if (names.isEmpty()) {
            return new Resolution(pathKey, segments, questionCount, false, false);
        }

        // ── segment 0: a measured quality, matched at the root only ──────────
        Match<Quality> mq = match(taxonomy, names.get(0), Quality::name);
        if (mq.ambiguous()) {
            segments.add(new Segment(names.get(0), AMBIGUOUS, null, null, null, null,
                    mq.count() + " measured qualities are called \"" + names.get(0) + "\" — pick one.",
                    null, null));
            return new Resolution(pathKey, segments, questionCount, false, true);
        }

        Quality quality = mq.value();
        if (quality == null) {
            // Root treated as a branch: the sheet's top level names something
            // that exists as a TYPE, not a quality. Left alone this silently
            // builds a whole parallel quality beside the real one, with real
            // items in it — cheap to spot here, expensive to find later.
            Found deeper = findAnywhere(taxonomy, names.get(0));
            segments.add(new Segment(names.get(0), CREATE, null, null, null, null,
                    deeper == null ? null
                            : "no measured quality has this name, but a type does, at " + deeper.path()
                                    + " — anchor the path there instead?",
                    deeper == null ? null : deeper.mqtId(),
                    deeper == null ? null : deeper.path()));
        } else {
            segments.add(new Segment(quality.name(), mq.status(), quality.id(), null, null, null, null,
                    null, null));
        }

        // ── the rest: types, each matched against the children of the one above ─
        List<Node> siblings = quality == null ? List.of() : safe(quality.roots());
        Node parent = null;
        boolean creating = quality == null;

        for (int i = 1; i < names.size(); i++) {
            String name = names.get(i);
            Long parentMqId = quality == null ? null : quality.id();
            Long parentMqtId = parent == null ? null : parent.id();

            if (creating) {
                segments.add(new Segment(name, CREATE, null, null, parentMqId, parentMqtId, null,
                        null, null));
                parent = null;
                continue;
            }

            Match<Node> hit = match(siblings, name, Node::name);
            if (hit.ambiguous()) {
                segments.add(new Segment(name, AMBIGUOUS, null, null, parentMqId, parentMqtId,
                        hit.count() + " types here are called \"" + name + "\" — pick one.",
                        null, null));
                return new Resolution(pathKey, segments, questionCount, false, true);
            }
            if (hit.value() == null) {
                // Not among this parent's children. It may exist elsewhere in
                // the same quality's tree, at another depth or under another
                // parent — a new node is still the right default, but the
                // reviewer is told, because sometimes they meant that one.
                Found elsewhere = quality == null ? null : findInTree(quality, name);
                segments.add(new Segment(name, CREATE, null, null, parentMqId, parentMqtId,
                        elsewhere == null ? null
                                : "a type of this name also exists at " + elsewhere.path()
                                        + " — this will be a new one.",
                        elsewhere == null ? null : elsewhere.mqtId(),
                        elsewhere == null ? null : elsewhere.path()));
                creating = true;
                parent = null;
                continue;
            }
            parent = hit.value();
            siblings = safe(parent.children());
            segments.add(new Segment(parent.name(), hit.status(), null, parent.id(),
                    parentMqId, parentMqtId, null, null, null));
        }

        boolean full = segments.stream().allMatch(Segment::isResolved);
        return new Resolution(pathKey, segments, questionCount, full, false);
    }

    /* ===================== matching ===================== */

    private record Match<T>(T value, String status, int count) {
        boolean ambiguous() {
            return count > 1;
        }
    }

    /**
     * EXACT first across the whole level, then NORMALISED. Two tiers and no
     * fuzzy one: fuzzy matching is defensible when the target certainly exists,
     * and indefensible when the alternative — creating a correctly named node —
     * is free.
     */
    private static <T> Match<T> match(List<T> candidates, String name, java.util.function.Function<T, String> naming) {
        if (candidates == null || candidates.isEmpty() || name == null) {
            return new Match<>(null, CREATE, 0);
        }
        List<T> exact = candidates.stream()
                .filter(c -> name.trim().equals(naming.apply(c) == null ? null : naming.apply(c).trim()))
                .toList();
        if (exact.size() == 1) {
            return new Match<>(exact.get(0), MATCHED, 1);
        }
        if (exact.size() > 1) {
            return new Match<>(null, AMBIGUOUS, exact.size());
        }
        String key = normalise(name);
        List<T> loose = candidates.stream().filter(c -> normalise(naming.apply(c)).equals(key)).toList();
        if (loose.size() == 1) {
            return new Match<>(loose.get(0), MATCHED_NORMALISED, 1);
        }
        if (loose.size() > 1) {
            return new Match<>(null, AMBIGUOUS, loose.size());
        }
        return new Match<>(null, CREATE, 0);
    }

    /* ===================== near-miss search ===================== */

    /** A node found by name somewhere it was not expected, with its full path. */
    private record Found(Long mqtId, String path) {
    }

    /** Where else in THIS quality's tree that name appears, or null. */
    private static Found findInTree(Quality quality, String name) {
        return walk(safe(quality.roots()), quality.name(), normalise(name));
    }

    /** Where in ANY quality's tree that name appears, or null. */
    private static Found findAnywhere(List<Quality> taxonomy, String name) {
        String key = normalise(name);
        for (Quality q : safe(taxonomy)) {
            Found found = walk(safe(q.roots()), q.name(), key);
            if (found != null) {
                return found;
            }
        }
        return null;
    }

    private static Found walk(List<Node> nodes, String prefix, String key) {
        for (Node n : nodes) {
            String path = prefix + CanonicalRowExpander.PATH_SEPARATOR + n.name();
            if (normalise(n.name()).equals(key)) {
                return new Found(n.id(), path);
            }
            Found deeper = walk(safe(n.children()), path, key);
            if (deeper != null) {
                return deeper;
            }
        }
        return null;
    }

    /* ===================== helpers ===================== */

    public static List<String> splitPath(String pathKey) {
        List<String> out = new ArrayList<>();
        if (pathKey == null || pathKey.isBlank()) {
            return out;
        }
        for (String part : pathKey.split("›")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                out.add(trimmed);
            }
        }
        return out;
    }

    /** Path key → resolution, for callers that need to look one up by name. */
    public static LinkedHashMap<String, Resolution> byPath(List<Resolution> resolutions) {
        LinkedHashMap<String, Resolution> out = new LinkedHashMap<>();
        for (Resolution r : resolutions) {
            out.put(r.pathKey(), r);
        }
        return out;
    }

    private static <T> List<T> safe(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static String normalise(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("[\\s_-]", "");
    }
}
