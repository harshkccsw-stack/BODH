package com.bodhpsychometric.service.datastudio;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Component;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * The JSON columns of Data Studio — {@code sourceFilters}, {@code displayState},
 * a dashboard's {@code layout}, a widget's {@code config} — read and written in
 * one place.
 *
 * <p>They are TEXT holding JSON rather than typed columns because their shape
 * belongs to the frontend and changes with it: a new chart option or a new
 * grid preference would otherwise be a migration every time. The backend
 * therefore treats them as opaque and only guarantees the round trip.
 *
 * <p>Malformed stored JSON returns an empty map instead of throwing. A widget
 * whose config cannot be parsed should render as an empty tile the user can
 * fix, not take the whole dashboard down with a 500 — and the only way a row
 * gets there is a hand-edit in the database.
 */
@Component
public class DsJson {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final ObjectMapper json;

    public DsJson(ObjectMapper json) {
        this.json = json;
    }

    /** Stored JSON → map. Null, blank and unparseable all give an empty map. */
    public Map<String, Object> read(String stored) {
        if (stored == null || stored.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, Object> parsed = json.readValue(stored, MAP);
            return parsed == null ? new LinkedHashMap<>() : parsed;
        } catch (RuntimeException e) {
            return new LinkedHashMap<>();
        }
    }

    /** Map → stored JSON. Null and empty both store NULL, not "{}". */
    public String write(Map<String, Object> value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        return json.writeValueAsString(value);
    }

    /** A Long out of a filters map, whatever numeric shape JSON gave it. */
    public static Long longOf(Map<String, Object> map, String key) {
        Object raw = map == null ? null : map.get(key);
        if (raw == null) {
            return null;
        }
        if (raw instanceof Number number) {
            return number.longValue();
        }
        try {
            String text = String.valueOf(raw).trim();
            return text.isEmpty() ? null : Long.valueOf(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
