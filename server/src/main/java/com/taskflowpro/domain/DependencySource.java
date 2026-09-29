package com.taskflowpro.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum DependencySource {
    MANUAL("manual"), AI_SUGGESTED("ai_suggested");

    private final String value;

    DependencySource(String value) { this.value = value; }

    @JsonValue
    public String value() { return value; }

    @JsonCreator
    public static DependencySource fromValue(String value) {
        for (DependencySource source : values()) {
            if (source.value.equals(value)) return source;
        }
        throw new IllegalArgumentException("invalid dependency source: " + value);
    }
}
