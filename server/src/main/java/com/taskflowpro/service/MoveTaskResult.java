package com.taskflowpro.service;

import com.taskflowpro.domain.Task;
import java.util.List;

public record MoveTaskResult(Task task, List<RecomputedStatus> recomputed) {
    public record RecomputedStatus(String taskId, String status) { }
}
