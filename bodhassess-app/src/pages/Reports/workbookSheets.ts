/**
 * Picking the scoring-logic tab out of a psychometrician's workbook.
 *
 * Lives in its own module, with no `@/` imports and no axios, for one reason:
 * it is the only part of the import path that can be run outside the browser.
 * This project has no test runner, so "verified" here means transpiled and run
 * against `docs/Report Logic.xlsx` in node — which is only possible while this
 * file imports nothing but `xlsx`.
 *
 * ## Why this exists at all
 *
 * The first version read `wb.SheetNames[0]`. The workbook it was written for
 * has three tabs and the scoring logic is the SECOND one, so the importer read
 * the item list instead: fifteen rows of `I1 | 1 | Internal Drive | ...` under
 * a header row, none of it beneath a STEP heading. Every row satisfies the
 * parser's definition of a rule — three populated columns — so sixteen rules
 * called "I1 1", "I2 2" imported cleanly with no blockers, because their names
 * are all distinct. The failure was silent in both directions: nothing said
 * which tab had been read, and nothing said the rules were nonsense.
 *
 * ## How a tab is identified
 *
 * By name first, because the name is what the practitioner controls and what
 * they will fix if we tell them. By SHAPE second, because a workbook from
 * another practitioner will not use our names. Never by position — position is
 * what caused this.
 */

/** What one workbook yielded. `csv` is the only part the importer sends. */
export interface WorkbookRead {
  /** The scoring-logic tab as CSV, structure preserved. */
  csv: string;
  /** Which tab that was, so the wizard can show it. '' for a plain .csv file. */
  sheetName: string;
  /** The item-list tab, when the workbook has one. */
  itemsSheetName: string | null;
  /**
   * That tab as CSV — the dictionary the logic tab is written in. Sent to a
   * different endpoint from the rules, because it creates bindings rather than
   * rules, and a workbook may legitimately have one tab and not the other.
   */
  itemsCsv: string | null;
  /** Every other tab, so "we skipped these" is a statement and not a silence. */
  ignored: string[];
}

/** A tab reduced to rows of cells. Ragged — trailing empties are not padded. */
type Rows = string[][];

/** Names compared with their spacing and punctuation removed. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LOGIC_NAMES = new Set(['scoringlogic', 'scoring', 'logic', 'reportlogic', 'rules']);
const ITEM_NAMES = new Set(['itemsmaster', 'itemmaster', 'items', 'itembank', 'itemlist']);

/**
 * The header row of an item list, matched on column A alone.
 *
 * Deliberately narrow. A scoring-logic tab's column A holds a step heading or
 * a rule code, never the literal words "Item ID", so this cannot fire on the
 * sheet we want — and a check that could would be worse than the bug, because
 * it would refuse a real workbook with no way for the practitioner to see why.
 */
const ITEM_ID_HEADER = /^item[\s_-]?id$/i;

/** A step heading: a label alone on its row, with nothing beside it. */
function hasStepHeading(rows: Rows): boolean {
  return rows.some(
    (row) =>
      /^\s*step\b/i.test(row[0] ?? '') &&
      !(row[1] ?? '').trim() &&
      !(row[2] ?? '').trim(),
  );
}

/** An item list: some early row's column A is the Item_ID header. */
export function looksLikeItemList(rows: Rows): boolean {
  let checked = 0;
  for (const row of rows) {
    if (row.every((cell) => !(cell ?? '').trim())) continue;
    if (ITEM_ID_HEADER.test((row[0] ?? '').trim())) return true;
    if (++checked >= 5) break;
  }
  return false;
}

/** A rule row: a code or label in A and logic in C. */
function hasRuleRows(rows: Rows): boolean {
  return rows.some((row) => (row[2] ?? '').trim().length > 0);
}

/**
 * Choose the logic tab and the item tab.
 *
 * Exported and pure so the decision can be checked against a real workbook
 * without a browser. `rowsOf` is passed in rather than imported so the caller
 * owns the SheetJS dependency.
 */
export function pickSheets(
  sheetNames: string[],
  rowsOf: (name: string) => Rows,
): { logic: string | null; items: string | null } {
  let logic: string | null = null;
  let items: string | null = null;

  for (const name of sheetNames) {
    const key = normalise(name);
    if (!logic && LOGIC_NAMES.has(key)) logic = name;
    if (!items && ITEM_NAMES.has(key)) items = name;
  }

  // Shape, for a workbook that does not use those names. An item list is
  // identified even when it was not asked for, so that it can be ruled OUT as
  // the logic tab — which is the whole bug.
  const itemShaped = new Set<string>();
  for (const name of sheetNames) {
    if (looksLikeItemList(rowsOf(name))) itemShaped.add(name);
  }
  if (!items) {
    items = sheetNames.find((name) => itemShaped.has(name)) ?? null;
  }
  if (!logic) {
    logic =
      sheetNames.find((name) => !itemShaped.has(name) && hasStepHeading(rowsOf(name))) ?? null;
  }
  if (!logic) {
    // Last resort: a single-tab export of nothing but rules. The parser accepts
    // a sheet with no headings (it files the rules under Score computation and
    // warns), so refusing this shape would reject workbooks that used to work.
    logic =
      sheetNames.find((name) => !itemShaped.has(name) && hasRuleRows(rowsOf(name))) ?? null;
  }
  return { logic, items };
}

/**
 * Read a workbook into the CSV the backend parses.
 *
 * `FS: ','` and `blankrows: true` both matter and are unchanged from the first
 * version: the logic sheet's structure IS its blank rows and its empty
 * columns, and a converter that tidies them away destroys the section headings
 * the parser reads.
 */
export async function readWorkbook(file: File): Promise<WorkbookRead> {
  if (/\.csv$/i.test(file.name)) {
    // A bare .csv is one tab by definition, so it is the logic sheet or
    // nothing. An item sheet sent this way is refused by the parser, which
    // reads it by column name and says what it is missing.
    return {
      csv: await file.text(),
      sheetName: '',
      itemsSheetName: null,
      itemsCsv: null,
      ignored: [],
    };
  }

  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  const names = wb.SheetNames ?? [];
  if (names.length === 0) {
    throw new Error('That workbook has no sheets.');
  }

  const rowsOf = (name: string): Rows =>
    XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
      header: 1,
      blankrows: true,
      defval: '',
      raw: false,
    });

  const { logic, items } = pickSheets(names, rowsOf);
  if (!logic) {
    // Naming the tabs is the point of the message: the one thing the person
    // holding the file can do about this is rename a tab or send the right one.
    throw new Error(
      names.length === 1
        ? `"${names[0]}" holds no scoring rules. The scoring-logic tab has a rule code in ` +
          'column A, a name in column B and the logic in column C.'
        : `Could not find the scoring-logic tab in this workbook (it has ${names
            .map((n) => `"${n}"`)
            .join(', ')}). Name it "Scoring_Logic", or give the rules their own file.`,
    );
  }

  const toCsv = (name: string) =>
    XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: ',', blankrows: true });

  return {
    csv: toCsv(logic),
    sheetName: logic,
    itemsSheetName: items,
    itemsCsv: items ? toCsv(items) : null,
    ignored: names.filter((name) => name !== logic),
  };
}
