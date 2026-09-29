package com.taskflowpro.web;

import jakarta.validation.constraints.NotBlank;

public record CreateDependencyRequest(
        @NotBlank(message = "fromTaskId is required") String fromTaskId,
        @NotBlank(message = "toTaskId is required") String toTaskId
) { }
