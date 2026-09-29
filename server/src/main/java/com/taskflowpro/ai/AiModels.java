package com.taskflowpro.ai;

import java.util.List;

public final class AiModels {
    private AiModels() { }

    public record DependencySuggestion(
            String fromTaskId,
            String toTaskId,
            String reason,
            boolean wouldCreateCycle,
            boolean alreadyExists
    ) { }

    public record SuggestionOutcome(boolean ok, List<DependencySuggestion> suggestions, String message) { }

    public record DriftFinding(String taskId, String type, String relatedTaskId, String explanation) { }

    public record DriftOutcome(boolean ok, List<DriftFinding> findings, String message) { }

    public record ToolCall(String name, Object input, Object result) { }

    public record InvestigatorOutcome(String answer, List<ToolCall> toolCalls) { }
}
