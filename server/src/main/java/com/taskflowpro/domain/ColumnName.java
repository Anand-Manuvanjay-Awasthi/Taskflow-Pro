package com.taskflowpro.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ColumnName {
    BACKLOG("backlog"), IN_PROGRESS("in_progress"), REVIEW("review"), DONE("done");

    private final String value;

    ColumnName(String value) { this.value = value; }

    @JsonValue
    public String value() { return value; }

    @JsonCreator
    public static ColumnName fromValue(String value) {
        for (ColumnName column : values()) {
            if (column.value.equals(value)) return column;
        }
        throw new IllegalArgumentException("invalid column: " + value);
    }
}
