package com.bodhpsychometric.bodhassess.analytics.expression;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.bodhpsychometric.bodhassess.analytics.payload.ValidateExprResponseDto;

/**
 * Parser + validator for the Data Studio formula language. The grammar is a
 * <b>closed whitelist</b> — arithmetic, comparisons, boolean logic, and a fixed
 * set of functions referencing dataset column keys (e.g. {@code mqt:OPENNESS},
 * {@code demo:age}, {@code calc:other}). It never evaluates arbitrary code.
 *
 * <p>Phase 1 used this only to validate + classify. Phase 2 adds a real AST
 * ({@link Node}) so {@link ExpressionEvaluator} can evaluate SERVER expressions
 * (population/cohort math) over the full dataset on the backend. CLIENT
 * (row-local) expressions still evaluate in the browser.
 */
@Service
public class ExpressionService {

    public static final String CLIENT = "CLIENT";
    public static final String SERVER = "SERVER";

    private static final int MAX_LEN = 2000;

    // Row-local functions — safe to evaluate client-side over loaded rows.
    static final Set<String> CLIENT_FUNCS = new LinkedHashSet<>(Arrays.asList(
            "IF", "AND", "OR", "NOT", "MIN", "MAX", "ROUND", "ABS", "SQRT", "LOG"));

    // Population / cohort functions — require all rows → server-side only.
    static final Set<String> SERVER_FUNCS = new LinkedHashSet<>(Arrays.asList(
            "AVERAGE", "SUM", "COUNT", "AVERAGEIF", "COUNTIF",
            "PERCENTILE", "PERCENTRANK", "ZSCORE", "RANK", "NORMBAND"));

    enum T { NUMBER, STRING, BOOLEAN, UNKNOWN }

    /* ===================== AST ===================== */

    public abstract static class Node {}

    public static final class NumLit extends Node { public final double v; NumLit(double v) { this.v = v; } }
    public static final class StrLit extends Node { public final String v; StrLit(String v) { this.v = v; } }
    public static final class ColRef extends Node { public final String key; ColRef(String key) { this.key = key; } }
    public static final class Neg extends Node { public final Node e; Neg(Node e) { this.e = e; } }
    public static final class Bin extends Node { public final String op; public final Node l, r; Bin(String op, Node l, Node r) { this.op = op; this.l = l; this.r = r; } }
    public static final class Cmp extends Node { public final String op; public final Node l, r; Cmp(String op, Node l, Node r) { this.op = op; this.l = l; this.r = r; } }
    public static final class And extends Node { public final Node l, r; And(Node l, Node r) { this.l = l; this.r = r; } }
    public static final class Or extends Node { public final Node l, r; Or(Node l, Node r) { this.l = l; this.r = r; } }
    public static final class Not extends Node { public final Node e; Not(Node e) { this.e = e; } }
    public static final class Call extends Node {
        public final String name;            // upper-cased
        public final List<Node> args;
        public final String scopeColumn;     // BY <col>, or null
        public final int id;                 // stable per-parse id for aggregate caching
        Call(String name, List<Node> args, String scopeColumn, int id) {
            this.name = name; this.args = args; this.scopeColumn = scopeColumn; this.id = id;
        }
    }

    /* ===================== public API ===================== */

    /** Parse to an AST. Throws {@link IllegalArgumentException} on syntax error. */
    public Node parse(String expr) {
        if (expr == null || expr.trim().isEmpty()) throw new IllegalArgumentException("Formula is empty.");
        if (expr.length() > MAX_LEN) throw new IllegalArgumentException("Formula is too long.");
        Parser p = new Parser(new Lexer(expr).tokenize());
        Node root = p.parseExpression();
        p.expectEnd();
        return root;
    }

    /**
     * Validate {@code expr} against the available column keys. Never throws —
     * problems are reported via {@link ValidateExprResponseDto#getErrors()}.
     */
    public ValidateExprResponseDto validate(String expr, Set<String> availableColumns) {
        ValidateExprResponseDto out = new ValidateExprResponseDto();
        Set<String> available = availableColumns == null ? Set.of() : availableColumns;
        Analysis a = new Analysis(available);
        try {
            Node root = parse(expr);
            analyze(root, a);
            out.setResultType(typeName(inferType(root)));
        } catch (IllegalArgumentException ex) {
            a.errors.add(ex.getMessage());
        }
        out.getErrors().addAll(a.errors);
        out.getReferencedColumns().addAll(a.columns);
        out.getFunctions().addAll(a.functions);
        out.setEvalTarget(a.serverUsed ? SERVER : CLIENT);
        out.setOk(a.errors.isEmpty());
        if (out.getResultType() == null) out.setResultType("number");
        return out;
    }

    private static String typeName(T t) {
        switch (t) {
            case STRING: return "string";
            case BOOLEAN: return "boolean";
            default: return "number";
        }
    }

    /* ===================== analysis ===================== */

    private static final class Analysis {
        final Set<String> available;
        final Set<String> columns = new LinkedHashSet<>();
        final Set<String> functions = new LinkedHashSet<>();
        final List<String> errors = new ArrayList<>();
        boolean serverUsed;
        Analysis(Set<String> available) { this.available = available; }
        void useColumn(String key) {
            columns.add(key);
            if (!available.isEmpty() && !available.contains(key)) errors.add("Unknown column: " + key);
        }
    }

    private void analyze(Node n, Analysis a) {
        if (n instanceof ColRef) {
            a.useColumn(((ColRef) n).key);
        } else if (n instanceof Neg) {
            analyze(((Neg) n).e, a);
        } else if (n instanceof Not) {
            analyze(((Not) n).e, a);
        } else if (n instanceof Bin) {
            analyze(((Bin) n).l, a); analyze(((Bin) n).r, a);
        } else if (n instanceof Cmp) {
            analyze(((Cmp) n).l, a); analyze(((Cmp) n).r, a);
        } else if (n instanceof And) {
            analyze(((And) n).l, a); analyze(((And) n).r, a);
        } else if (n instanceof Or) {
            analyze(((Or) n).l, a); analyze(((Or) n).r, a);
        } else if (n instanceof Call) {
            Call c = (Call) n;
            a.functions.add(c.name);
            if (SERVER_FUNCS.contains(c.name)) a.serverUsed = true;
            if (c.scopeColumn != null) a.useColumn(c.scopeColumn);
            checkArity(c, a);
            for (Node arg : c.args) analyze(arg, a);
        }
    }

    private void checkArity(Call c, Analysis a) {
        int n = c.args.size();
        switch (c.name) {
            case "IF": if (n != 3) a.errors.add("IF() takes 3 arguments (condition, then, else)."); break;
            case "NOT": case "ABS": case "SQRT": case "AVERAGE": case "SUM": case "COUNT":
            case "ZSCORE": case "PERCENTRANK": case "RANK": case "COUNTIF":
                if (n < 1) a.errors.add(c.name + "() requires an argument."); break;
            case "PERCENTILE": if (n != 2) a.errors.add("PERCENTILE(value, p) takes 2 arguments (p in 0–100)."); break;
            case "AVERAGEIF": if (n != 2) a.errors.add("AVERAGEIF(value, condition) takes 2 arguments."); break;
            case "ROUND": case "LOG": if (n < 1) a.errors.add(c.name + "() requires an argument."); break;
            case "NORMBAND":
                // value + k×(cut,label) + finalLabel  ⇒  args = 2 + 2k (even, ≥4).
                if (n < 4 || n % 2 != 0) {
                    a.errors.add("NORMBAND(value, cut1, label1, …, finalLabel) needs value plus cut/label pairs and a final label.");
                }
                break;
            case "MIN": case "MAX": case "AND": case "OR":
                if (n < 1) a.errors.add(c.name + "() requires at least one argument."); break;
            default: break;
        }
    }

    private T inferType(Node n) {
        if (n instanceof NumLit || n instanceof Neg || n instanceof Bin) return T.NUMBER;
        if (n instanceof StrLit) return T.STRING;
        if (n instanceof Cmp || n instanceof And || n instanceof Or || n instanceof Not) return T.BOOLEAN;
        if (n instanceof ColRef) return T.UNKNOWN;
        if (n instanceof Call) {
            String name = ((Call) n).name;
            if ("NORMBAND".equals(name)) return T.STRING;
            if ("AND".equals(name) || "OR".equals(name) || "NOT".equals(name)) return T.BOOLEAN;
            return T.NUMBER;
        }
        return T.UNKNOWN;
    }

    /* ===================== lexer ===================== */

    private enum Kind { NUM, STR, IDENT, OP, LPAREN, RPAREN, COMMA, EOF }

    private static final class Token {
        final Kind kind; final String text; final boolean bracketed;
        Token(Kind kind, String text) { this(kind, text, false); }
        Token(Kind kind, String text, boolean bracketed) { this.kind = kind; this.text = text; this.bracketed = bracketed; }
    }

    private static final class Lexer {
        private final String s; private int i;
        Lexer(String s) { this.s = s; }

        List<Token> tokenize() {
            List<Token> out = new ArrayList<>();
            while (i < s.length()) {
                char c = s.charAt(i);
                if (Character.isWhitespace(c)) { i++; continue; }
                if (c == '(') { out.add(new Token(Kind.LPAREN, "(")); i++; continue; }
                if (c == ')') { out.add(new Token(Kind.RPAREN, ")")); i++; continue; }
                if (c == ',') { out.add(new Token(Kind.COMMA, ",")); i++; continue; }
                if (c == '[') { out.add(readBracketed()); continue; }
                if (c == '"' || c == '\'') { out.add(readString(c)); continue; }
                if (Character.isDigit(c) || (c == '.' && i + 1 < s.length() && Character.isDigit(s.charAt(i + 1)))) {
                    out.add(readNumber()); continue;
                }
                if (isIdentStart(c)) { out.add(readIdent()); continue; }
                if (isOpChar(c)) { out.add(readOperator()); continue; }
                throw new IllegalArgumentException("Unexpected character '" + c + "'.");
            }
            out.add(new Token(Kind.EOF, ""));
            return out;
        }

        private Token readString(char quote) {
            i++;
            StringBuilder b = new StringBuilder();
            while (i < s.length() && s.charAt(i) != quote) { b.append(s.charAt(i)); i++; }
            if (i >= s.length()) throw new IllegalArgumentException("Unterminated string literal.");
            i++;
            return new Token(Kind.STR, b.toString());
        }

        // [column key] — a bracket-quoted column reference. Allows any character
        // except ']' (e.g. hyphenated MQT ids like mqt:mqt-4ur6d57j).
        private Token readBracketed() {
            i++; // skip '['
            StringBuilder b = new StringBuilder();
            while (i < s.length() && s.charAt(i) != ']') { b.append(s.charAt(i)); i++; }
            if (i >= s.length()) throw new IllegalArgumentException("Unterminated '[' column reference.");
            i++; // skip ']'
            if (b.length() == 0) throw new IllegalArgumentException("Empty '[]' column reference.");
            return new Token(Kind.IDENT, b.toString(), true);
        }

        private Token readNumber() {
            int start = i; boolean dot = false;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (Character.isDigit(c)) i++;
                else if (c == '.' && !dot) { dot = true; i++; }
                else break;
            }
            return new Token(Kind.NUM, s.substring(start, i));
        }

        private Token readIdent() {
            int start = i; i++;
            while (i < s.length() && isIdentPart(s.charAt(i))) i++;
            return new Token(Kind.IDENT, s.substring(start, i));
        }

        private Token readOperator() {
            if (i + 1 < s.length()) {
                String two = s.substring(i, i + 2);
                if (two.equals("==") || two.equals("!=") || two.equals("<=") || two.equals(">=") || two.equals("<>")) {
                    i += 2; return new Token(Kind.OP, two);
                }
            }
            char c = s.charAt(i); i++;
            return new Token(Kind.OP, String.valueOf(c));
        }

        private static boolean isIdentStart(char c) { return Character.isLetter(c) || c == '_'; }
        private static boolean isIdentPart(char c) { return Character.isLetterOrDigit(c) || c == '_' || c == ':'; }
        private static boolean isOpChar(char c) {
            return c == '+' || c == '-' || c == '*' || c == '/' || c == '=' || c == '!' || c == '<' || c == '>';
        }
    }

    /* ===================== parser ===================== */

    private static final class Parser {
        private final List<Token> tokens;
        private int pos;
        private int callSeq;

        Parser(List<Token> tokens) { this.tokens = tokens; }

        private Token peek() { return tokens.get(pos); }
        private Token next() { return tokens.get(pos++); }
        private boolean isKeyword(Token t, String kw) { return t.kind == Kind.IDENT && t.text.equalsIgnoreCase(kw); }

        void expectEnd() {
            if (peek().kind != Kind.EOF) throw new IllegalArgumentException("Unexpected '" + peek().text + "' after expression.");
        }

        Node parseExpression() { return parseOr(); }

        private Node parseOr() {
            Node n = parseAnd();
            while (isKeyword(peek(), "OR")) { next(); n = new Or(n, parseAnd()); }
            return n;
        }

        private Node parseAnd() {
            Node n = parseNot();
            while (isKeyword(peek(), "AND")) { next(); n = new And(n, parseNot()); }
            return n;
        }

        private Node parseNot() {
            if (isKeyword(peek(), "NOT")) { next(); return new Not(parseNot()); }
            return parseComparison();
        }

        private Node parseComparison() {
            Node n = parseAdditive();
            Token p = peek();
            if (p.kind == Kind.OP && isComparator(p.text)) { next(); return new Cmp(p.text, n, parseAdditive()); }
            return n;
        }

        private static boolean isComparator(String op) {
            return op.equals("=") || op.equals("==") || op.equals("!=") || op.equals("<>")
                    || op.equals("<") || op.equals("<=") || op.equals(">") || op.equals(">=");
        }

        private Node parseAdditive() {
            Node n = parseMultiplicative();
            while (peek().kind == Kind.OP && (peek().text.equals("+") || peek().text.equals("-"))) {
                String op = next().text; n = new Bin(op, n, parseMultiplicative());
            }
            return n;
        }

        private Node parseMultiplicative() {
            Node n = parseUnary();
            while (peek().kind == Kind.OP && (peek().text.equals("*") || peek().text.equals("/"))) {
                String op = next().text; n = new Bin(op, n, parseUnary());
            }
            return n;
        }

        private Node parseUnary() {
            if (peek().kind == Kind.OP && peek().text.equals("-")) { next(); return new Neg(parseUnary()); }
            if (peek().kind == Kind.OP && peek().text.equals("+")) { next(); return parseUnary(); }
            return parsePrimary();
        }

        private Node parsePrimary() {
            Token t = peek();
            switch (t.kind) {
                case NUM: next(); return new NumLit(Double.parseDouble(t.text));
                case STR: next(); return new StrLit(t.text);
                case LPAREN: { next(); Node inner = parseExpression(); expect(Kind.RPAREN, ")"); return inner; }
                case IDENT: {
                    if (t.bracketed) { next(); return new ColRef(t.text); }  // [key] is always a column
                    if (isKeyword(t, "AND") || isKeyword(t, "OR") || isKeyword(t, "NOT") || isKeyword(t, "BY")) {
                        throw new IllegalArgumentException("Unexpected keyword '" + t.text + "'.");
                    }
                    next();
                    if (peek().kind == Kind.LPAREN) return parseCall(t.text);
                    return new ColRef(t.text);
                }
                case EOF: throw new IllegalArgumentException("Unexpected end of formula.");
                default: throw new IllegalArgumentException("Unexpected '" + t.text + "'.");
            }
        }

        private Node parseCall(String rawName) {
            String name = rawName.toUpperCase();
            if (!CLIENT_FUNCS.contains(name) && !SERVER_FUNCS.contains(name)) {
                throw new IllegalArgumentException("Unknown function: " + rawName + "().");
            }
            expect(Kind.LPAREN, "(");
            List<Node> args = new ArrayList<>();
            String scope = null;
            if (peek().kind != Kind.RPAREN) {
                scope = parseArgInto(args, name, scope);
                while (peek().kind == Kind.COMMA) { next(); scope = parseArgInto(args, name, scope); }
            }
            expect(Kind.RPAREN, ")");
            return new Call(name, args, scope, callSeq++);
        }

        // Returns updated scope (set when a "BY col" argument is seen).
        private String parseArgInto(List<Node> args, String funcName, String scope) {
            if (isKeyword(peek(), "BY")) {
                next();
                if (!SERVER_FUNCS.contains(funcName)) {
                    throw new IllegalArgumentException("'BY' scope is only valid in population functions, not " + funcName + "().");
                }
                Token col = peek();
                if (col.kind != Kind.IDENT) throw new IllegalArgumentException("Expected a column after 'BY'.");
                next();
                return col.text;
            }
            args.add(parseExpression());
            return scope;
        }

        private void expect(Kind kind, String what) {
            if (peek().kind != kind) throw new IllegalArgumentException("Expected '" + what + "' but found '" + peek().text + "'.");
            next();
        }
    }
}
