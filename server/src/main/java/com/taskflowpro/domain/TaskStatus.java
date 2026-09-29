package com.taskflowpro.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum TaskStatus {
    READY("ready"), BLOCKED("blocked");

    private final String value;

    TaskStatus(String value) { this.value = value; }

    @JsonValue
    public String value() { return value; }

    @JsonCreator
    public static TaskStatus fromValue(String value) {
        for (TaskStatus status : values()) {
            if (status.value.equals(value)) return status;
        }
        throw new IllegalArgumentException("invalid task status: " + value);
    }
}
