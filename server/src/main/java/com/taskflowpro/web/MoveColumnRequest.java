package com.taskflowpro.web;

import com.taskflowpro.domain.ColumnName;
import jakarta.validation.constraints.NotNull;

public record MoveColumnRequest(@NotNull(message = "column is required") ColumnName column) { }
