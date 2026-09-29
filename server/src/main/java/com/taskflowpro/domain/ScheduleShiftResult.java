package com.taskflowpro.domain;

public record ScheduleShiftResult(String taskId, String oldStartDate, String newStartDate, int shiftDays) { }
