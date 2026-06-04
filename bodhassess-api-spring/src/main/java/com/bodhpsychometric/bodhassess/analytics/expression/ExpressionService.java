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
 * {@code demo:age}, {@code calc:other}). It never evaluates arbitrary code and,
 * critically, is the only thing that may later be compiled to SQL (Phase 2),
 * always parameterised — no user text reaches a query as SQL.
 *
 * <p>Phase 1 responsibilities: parse, validate column references against the
 * sheet's live column set, infer result type, and classify the expression as
 * CLIENT (row-local math, run in the browser) or SERVER (population/cohort
 * math, run on the backend). Evaluation/compilation is Phase 2.
 */
@Service
public class ExpressionService {

    public static final String CLIENT = "CLIENT";
    public static final String SERVER = "SERVER";

    private static final int MAX_LEN = 2000;

    // Row-local functions — safe to evaluate client-side over loaded rows.
    private static final Set<String> CLIENT_FUNCS = new LinkedHashSet<>(Arrays.asList(
            "IF", "AND", "OR", "NOT", "MIN", "MAX", "ROUND", "ABS", "SQRT", "LOG"));

    // Population / cohort functions — require all rows / GROUP BY → server-side.
    private static final Set<String> SERVER_FUNCS = new LinkedHashSet<>(Arrays.asList(
            "AVERAGE", "SUM", "COUNT", "AVERAGEIF", "COUNTIF",
            "PERCENTILE", "PERCENTRANK", "ZSCORE", "RANK", "NORMBAND"));

    private enum T { NUMBER, STRING, BOOLEAN, UNKNOWN }

    /**
     * Validate {@code expr} against the available column keys. Never throws —
     * problems are reported via {@link ValidateExprResponseDto#getErrors()} with
     * {@code ok=false}.
     */
    public ValidateExprResponseDto validate(String expr, Set<String> availableColumns) {
        ValidateExprResponseDto out = new ValidateExprResponseDto();
        if (expr == null || expr.trim().isEmpty()) {
            out.setOk(false);
            out.getErrors().add("Formula is empty.");
            return out;
        }
        if (expr.length() > MAX_LEN) {
            out.setOk(false);
            out.getErrors().add("Formula is too long (max " + MAX_LEN + " characters).");
            return out;
        }

        Analysis a = new Analysis(availableColumns == null ? Set.of() : availableColumns);
        try {
            List<Token> tokens = new Lexer(expr).tokenize();
            Parser p = new Parser(tokens, a);
            T type = p.parseExpression();
            p.expectEnd();
            out.setResultType(typeName(type));
        } catch (ExprException ex) {
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
            case NUMBER: return "number";
            default: return "number";
        }
    }

    /* ===================== internals ===================== */

    /** Mutable accumulator threaded through the parse. */
    private static final class Analysis {
        final Set<String> available;
        final Set<String> columns = new LinkedHashSet<>();
        final Set<String> functions = new LinkedHashSet<>();
        final List<String> errors = new ArrayList<>();
        boolean serverUsed;

        Analysis(Set<String> available) { this.available = available; }

        void useColumn(String key) {
            columns.add(key);
            if (!available.isEmpty() && !available.contains(key)) {
                errors.add("Unknown column: " + key);
            }
        }
    }

    private static final class ExprException extends RuntimeException {
        ExprException(String msg) { super(msg); }
    }

    /* ---------- lexer ---------- */

    private enum Kind { NUM, STR, IDENT, OP, LPAREN, RPAREN, COMMA, EOF }

    private static final class Token {
        final Kind kind;
        final String text;
        Token(Kind kind, String text) { this.kind = kind; this.text = text; }
    }

    private static final class Lexer {
        private final String s;
        private int i;

        Lexer(String s) { this.s = s; }

        List<Token> tokenize() {
            List<Token> out = new ArrayList<>();
            while (i < s.length()) {
                char c = s.charAt(i);
                if (Character.isWhitespace(c)) { i++; continue; }
                if (c == '(') { out.add(new Token(Kind.LPAREN, "(")); i++; continue; }
                if (c == ')') { out.add(new Token(Kind.RPAREN, ")")); i++; continue; }
                if (c == ',') { out.add(new Token(Kind.COMMA, ",")); i++; continue; }
                if (c == '"' || c == '\'') { out.add(readString(c)); continue; }
                if (Character.isDigit(c) || (c == '.' && i + 1 < s.length() && Character.isDigit(s.charAt(i + 1)))) {
                    out.add(readNumber());
                    continue;
                }
                if (isIdentStart(c)) { out.add(readIdent()); continue; }
                if (isOpChar(c)) { out.add(readOperator()); continue; }
                throw new ExprException("Unexpected character '" + c + "'.");
            }
            out.add(new Token(Kind.EOF, ""));
            return out;
        }

        private Token readString(char quote) {
            i++; // skip opening quote
            StringBuilder b = new StringBuilder();
            while (i < s.length() && s.charAt(i) != quote) {
                b.append(s.charAt(i));
                i++;
            }
            if (i >= s.length()) throw new ExprException("Unterminated string literal.");
            i++; // skip closing quote
            return new Token(Kind.STR, b.toString());
        }

        private Token readNumber() {
            int start = i;
            boolean dot = false;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (Character.isDigit(c)) { i++; }
                else if (c == '.' && !dot) { dot = true; i++; }
                else break;
            }
            return new Token(Kind.NUM, s.substring(start, i));
        }

        private Token readIdent() {
            int start = i;
            i++;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (isIdentPart(c)) i++;
                else break;
            }
            return new Token(Kind.IDENT, s.substring(start, i));
        }

        private Token readOperator() {
            // two-char operators first
            if (i + 1 < s.length()) {
                String two = s.substring(i, i + 2);
                if (two.equals("==") || two.equals("!=") || two.equals("<=")
                        || two.equals(">=") || two.equals("<>")) {
                    i += 2;
                    return new Token(Kind.OP, two);
                }
            }
            char c = s.charAt(i);
            i++;
            return new Token(Kind.OP, String.valueOf(c));
        }

        private static boolean isIdentStart(char c) { return Character.isLetter(c) || c == '_'; }
        private static boolean isIdentPart(char c) {
            return Character.isLetterOrDigit(c) || c == '_' || c == ':';
        }
        private static boolean isOpChar(char c) {
            return c == '+' || c == '-' || c == '*' || c == '/'
                    || c == '=' || c == '!' || c == '<' || c == '>';
        }
    }

    /* ---------- parser (recursive descent) ---------- */

    private static final class Parser {
        private final List<Token> tokens;
        private final Analysis a;
        private int pos;

        Parser(List<Token> tokens, Analysis a) {
            this.tokens = tokens;
            this.a = a;
        }

        private Token peek() { return tokens.get(pos); }
        private Token next() { return tokens.get(pos++); }
        private boolean isKeyword(Token t, String kw) {
            return t.kind == Kind.IDENT && t.text.equalsIgnoreCase(kw);
        }

        void expectEnd() {
            if (peek().kind != Kind.EOF) {
                throw new ExprException("Unexpected '" + peek().text + "' after expression.");
            }
        }

        // expr := orExpr
        T parseExpression() { return parseOr(); }

        // orExpr := andExpr ( OR andExpr )*
        private T parseOr() {
            T t = parseAnd();
            while (isKeyword(peek(), "OR")) {
                next();
                parseAnd();
                t = T.BOOLEAN;
            }
            return t;
        }

        // andExpr := notExpr ( AND notExpr )*
        private T parseAnd() {
            T t = parseNot();
            while (isKeyword(peek(), "AND")) {
                next();
                parseNot();
                t = T.BOOLEAN;
            }
            return t;
        }

        // notExpr := NOT notExpr | comparison
        private T parseNot() {
            if (isKeyword(peek(), "NOT")) {
                next();
                parseNot();
                return T.BOOLEAN;
            }
            return parseComparison();
        }

        // comparison := additive ( (= == != <> < <= > >=) additive )?
        private T parseComparison() {
            T t = parseAdditive();
            Token p = peek();
            if (p.kind == Kind.OP && isComparator(p.text)) {
                next();
                parseAdditive();
                return T.BOOLEAN;
            }
            return t;
        }

        private static boolean isComparator(String op) {
            return op.equals("=") || op.equals("==") || op.equals("!=") || op.equals("<>")
                    || op.equals("<") || op.equals("<=") || op.equals(">") || op.equals(">=");
        }

        // additive := multiplicative ( (+ -) multiplicative )*
        private T parseAdditive() {
            T t = parseMultiplicative();
            while (peek().kind == Kind.OP && (peek().text.equals("+") || peek().text.equals("-"))) {
                next();
                parseMultiplicative();
                t = T.NUMBER;
            }
            return t;
        }

        // multiplicative := unary ( (* /) unary )*
        private T parseMultiplicative() {
            T t = parseUnary();
            while (peek().kind == Kind.OP && (peek().text.equals("*") || peek().text.equals("/"))) {
                next();
                parseUnary();
                t = T.NUMBER;
            }
            return t;
        }

        // unary := (- ) unary | primary
        private T parseUnary() {
            if (peek().kind == Kind.OP && peek().text.equals("-")) {
                next();
                parseUnary();
                return T.NUMBER;
            }
            if (peek().kind == Kind.OP && peek().text.equals("+")) {
                next();
                return parseUnary();
            }
            return parsePrimary();
        }

        // primary := NUM | STR | funcCall | columnRef | ( expr )
        private T parsePrimary() {
            Token t = peek();
            switch (t.kind) {
                case NUM:
                    next();
                    return T.NUMBER;
                case STR:
                    next();
                    return T.STRING;
                case LPAREN: {
                    next();
                    T inner = parseExpression();
                    expect(Kind.RPAREN, ")");
                    return inner;
                }
                case IDENT: {
                    // reserved words must not appear as a primary
                    if (isKeyword(t, "AND") || isKeyword(t, "OR")
                            || isKeyword(t, "NOT") || isKeyword(t, "BY")) {
                        throw new ExprException("Unexpected keyword '" + t.text + "'.");
                    }
                    next();
                    if (peek().kind == Kind.LPAREN) {
                        return parseFunctionCall(t.text);
                    }
                    a.useColumn(t.text);
                    return T.UNKNOWN; // a column's type is data-dependent
                }
                case EOF:
                    throw new ExprException("Unexpected end of formula.");
                default:
                    throw new ExprException("Unexpected '" + t.text + "'.");
            }
        }

        private T parseFunctionCall(String rawName) {
            String name = rawName.toUpperCase();
            boolean client = CLIENT_FUNCS.contains(name);
            boolean server = SERVER_FUNCS.contains(name);
            if (!client && !server) {
                throw new ExprException("Unknown function: " + rawName + "().");
            }
            a.functions.add(name);
            if (server) a.serverUsed = true;

            expect(Kind.LPAREN, "(");
            int argCount = 0;
            if (peek().kind != Kind.RPAREN) {
                parseArgument(name);
                argCount++;
                while (peek().kind == Kind.COMMA) {
                    next();
                    parseArgument(name);
                    argCount++;
                }
            }
            expect(Kind.RPAREN, ")");
            checkArity(rawName, name, argCount);
            return functionType(name);
        }

        // arg := BY columnRef | expr
        private void parseArgument(String funcName) {
            if (isKeyword(peek(), "BY")) {
                next();
                if (!SERVER_FUNCS.contains(funcName)) {
                    a.errors.add("'BY' scope is only valid in population functions, not " + funcName + "().");
                }
                Token col = peek();
                if (col.kind != Kind.IDENT) {
                    throw new ExprException("Expected a column after 'BY'.");
                }
                next();
                a.useColumn(col.text);
                return;
            }
            parseExpression();
        }

        private void checkArity(String rawName, String name, int argCount) {
            if ("IF".equals(name) && argCount != 3) {
                a.errors.add("IF() takes exactly 3 arguments (condition, then, else).");
            } else if (("ROUND".equals(name) || "PERCENTILE".equals(name)) && argCount < 1) {
                a.errors.add(rawName + "() requires at least one argument.");
            } else if (argCount == 0) {
                a.errors.add(rawName + "() requires at least one argument.");
            }
        }

        private static T functionType(String name) {
            if ("NORMBAND".equals(name)) return T.STRING;
            if ("AND".equals(name) || "OR".equals(name) || "NOT".equals(name)) return T.BOOLEAN;
            return T.NUMBER;
        }

        private void expect(Kind kind, String what) {
            if (peek().kind != kind) {
                throw new ExprException("Expected '" + what + "' but found '" + peek().text + "'.");
            }
            next();
        }
    }
}
