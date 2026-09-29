package com.taskflowpro.domain;

public record Task(
        String id,
        String title,
        String description,
        ColumnName column,
        TaskStatus status,
        String startDate,
        int duration,
        String createdAt,
        String updatedAt
) { }
