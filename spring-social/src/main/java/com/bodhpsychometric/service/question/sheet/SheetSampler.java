package com.bodhpsychometric.service.question.sheet;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import com.bodhpsychometric.service.report.ScoringSheetParser;

/**
 * A workbook → the small amount of it a model needs to work out its shape.
 *
 * <h2>Why a sample and not the sheet</h2>
 *
 * The model is answering "which column is the question text", not "what do
 * these questions say". Ten rows answer that as well as a thousand, so cost,
 * latency and how much of somebody's instrument leaves the building all scale
 * with the sheet's SHAPE rather than its size. A 1500-item bank sends the same
 * sample as a 15-item one.
 *
 * <h2>What is said about the rows that are not shown</h2>
 *
 * Two numbers, and they are the two the mapping actually needs: the last row
 * that still looks like part of the table, and the first blank row after the
 * head. An earlier version said "N more rows of the same shape, ending at row
 * {last row of the sheet}" — which on the reference workbook claimed the table
 * ran to row 22 when it stopped at 16, and was only right by luck because the
 * notes below carried their own row numbers.
 *
 * <h2>The rows after the table are not decoration</h2>
 *
 * In the reference workbook the answer scale exists ONLY in a prose paragraph
 * below the table — "1=Strongly Disagree … 5=Strongly Agree". So everything
 * after the first blank row that follows the head is shown, bounded, whatever
 * its cell count: a legend written as two cells is exactly as important as one
 * written as a sentence, and a rule of "one filled cell means prose" would
 * have hidden it.
 */
public final class SheetSampler {

    private SheetSampler() {
    }

    /** Table rows shown before the summary. */
    private static final int HEAD_ROWS = 10;
    /** Rows after the table worth showing — notes blocks are short. */
    private static final int TAIL_ROWS = 15;
    /** How much of one cell is worth showing — enough to recognise, not to read. */
    private static final int CELL_CHARS = 180;
    private static final int MAX_SHEETS = 8;

    public record Sheet(String name, String csv) {
    }

    public record Sampled(String prompt, List<String> sheetNames) {
    }

    public static Sampled sample(List<Sheet> sheets) {
        StringBuilder out = new StringBuilder();
        List<String> names = new ArrayList<>();
        int shown = 0;

        for (Sheet sheet : sheets) {
            if (shown++ >= MAX_SHEETS) {
                out.append("\n(").append(sheets.size() - MAX_SHEETS).append(" further sheets not shown)\n");
                break;
            }
            List<List<String>> grid = ScoringSheetParser.readCsv(sheet.csv() == null ? "" : sheet.csv());
            List<List<String>> rows = trimTrailingBlanks(grid);
            names.add(sheet.name());

            out.append("\n### Sheet \"").append(sheet.name()).append("\" — ")
                    .append(rows.size()).append(" rows\n");
            if (rows.isEmpty()) {
                out.append("(empty)\n");
                continue;
            }

            Set<Integer> printed = new LinkedHashSet<>();
            for (int i = 0; i < Math.min(HEAD_ROWS, rows.size()); i++) {
                appendRow(out, i + 1, rows.get(i));
                printed.add(i);
            }
            if (rows.size() <= HEAD_ROWS) {
                continue;
            }

            int lastTable = lastTableRow(rows);
            int firstBlank = firstBlankFrom(rows, HEAD_ROWS);

            StringBuilder summary = new StringBuilder("… ");
            if (lastTable >= HEAD_ROWS) {
                summary.append("the table continues to row ").append(lastTable + 1)
                        .append(" (").append(lastTable + 1 - HEAD_ROWS)
                        .append(" more rows of the same shape)");
            } else {
                summary.append("no further rows look like table rows");
            }
            if (firstBlank >= 0) {
                summary.append("; row ").append(firstBlank + 1).append(" is blank");
            }
            summary.append("; the sheet's last row is ").append(rows.size()).append(".\n");
            out.append(summary);

            // Everything after the first blank row past the head — that
            // position, not the cell count, is what says it is not data.
            List<Integer> tail = new ArrayList<>();
            int from = firstBlank >= 0 ? firstBlank + 1 : rows.size();
            for (int i = from; i < rows.size() && tail.size() < TAIL_ROWS; i++) {
                if (!isBlank(rows.get(i))) {
                    tail.add(i);
                }
            }
            // And single-cell prose anywhere beyond the head, for a notes block
            // that sits directly under the table with no blank line before it.
            for (int i = HEAD_ROWS; i < rows.size() && tail.size() < TAIL_ROWS; i++) {
                if (!tail.contains(i) && isProse(rows.get(i))) {
                    tail.add(i);
                }
            }
            if (!tail.isEmpty()) {
                tail.sort(null);
                out.append("--- rows after the table (notes, legends, instructions) ---\n");
                for (int i : tail) {
                    if (printed.add(i)) {
                        appendRow(out, i + 1, rows.get(i));
                    }
                }
            }
        }
        return new Sampled(out.toString(), names);
    }

    /* ===================== shape ===================== */

    /** Index of the last row with at least two filled cells, or -1. */
    private static int lastTableRow(List<List<String>> rows) {
        for (int i = rows.size() - 1; i >= 0; i--) {
            if (filled(rows.get(i)) >= 2) {
                return i;
            }
        }
        return -1;
    }

    private static int firstBlankFrom(List<List<String>> rows, int from) {
        for (int i = from; i < rows.size(); i++) {
            if (isBlank(rows.get(i))) {
                return i;
            }
        }
        return -1;
    }

    /** One filled cell and something long enough to be a sentence. */
    private static boolean isProse(List<String> row) {
        return filled(row) == 1 && row.stream().anyMatch(c -> c != null && c.trim().length() > 12);
    }

    private static long filled(List<String> row) {
        return row.stream().filter(c -> c != null && !c.isBlank()).count();
    }

    private static boolean isBlank(List<String> row) {
        return row.stream().allMatch(c -> c == null || c.isBlank());
    }

    private static List<List<String>> trimTrailingBlanks(List<List<String>> grid) {
        int last = grid.size();
        while (last > 0 && isBlank(grid.get(last - 1))) {
            last--;
        }
        return grid.subList(0, last);
    }

    /* ===================== text ===================== */

    private static void appendRow(StringBuilder out, int rowNo, List<String> row) {
        out.append("row ").append(rowNo);
        for (String cell : row) {
            out.append(" | ").append(truncate(cell));
        }
        out.append('\n');
    }

    private static String truncate(String cell) {
        String v = cell == null ? "" : cell.trim().replace('\n', ' ');
        return v.length() <= CELL_CHARS ? v : v.substring(0, CELL_CHARS) + "…";
    }
}
