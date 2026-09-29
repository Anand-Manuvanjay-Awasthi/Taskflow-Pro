package com.taskflowpro.web;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record CreateTaskRequest(
        @NotBlank(message = "title is required") String title,
        String description,
        String startDate,
        @Positive(message = "duration must be a positive integer") Integer duration
) { }
