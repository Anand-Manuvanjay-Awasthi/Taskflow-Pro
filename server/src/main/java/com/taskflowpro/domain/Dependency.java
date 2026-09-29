package com.taskflowpro.domain;

public record Dependency(
        String id,
        String fromTaskId,
        String toTaskId,
        String createdAt,
        DependencySource source
) { }
