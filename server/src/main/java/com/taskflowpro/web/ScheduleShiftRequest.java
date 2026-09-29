package com.taskflowpro.web;

import jakarta.validation.constraints.NotNull;

public record ScheduleShiftRequest(@NotNull(message = "deltaDays is required") Integer deltaDays) { }
