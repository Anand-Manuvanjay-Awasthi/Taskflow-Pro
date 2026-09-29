package com.taskflowpro.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflowpro.domain.Dependency;
import com.taskflowpro.domain.Task;
import com.taskflowpro.service.WorkflowService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class AiService {
    private static final int MAX_TOOL_ROUNDS = 6;

    private static final String INVESTIGATOR_SYSTEM_PROMPT = """
            You are the Pre-Commit Impact Investigator for TaskFlow Pro, a DAG-based Kanban tool.
            A user will ask a natural-language what-if question about the project's schedule or dependency graph.
            You have tool access to the real dependency graph and scheduling engine. You must call tools to get
            facts (upstream/downstream tasks, blocked tasks, critical path, and especially
            simulateScheduleChange for any date or slip question) rather than inventing numbers or relationships.
            Never claim an impact you have not verified with a tool call. After gathering what you need, give a
            concise, concrete answer citing the specific tasks and day counts returned by tools. Nothing here is
            persisted; this is a read-only investigation.
            """;

    private final WorkflowService workflow;
    private final LlmClient llmClient;
    private final ObjectMapper objectMapper;

    public AiService(WorkflowService workflow, LlmClient llmClient, ObjectMapper objectMapper) {
        this.workflow = workflow;
        this.llmClient = llmClient;
        this.objectMapper = objectMapper;
    }

    public AiModels.SuggestionOutcome suggestDependencies(String taskId) {
        Task task = workflow.getTask(taskId);
        List<Task> existingTasks = workflow.listTasks().stream().filter(item -> !item.id().equals(taskId)).toList();
        String prompt = suggestionPrompt(task, existingTasks);
        String lastError = null;

        for (int attempt = 0; attempt < 2; attempt++) {
            String userPrompt = attempt == 0 ? prompt : prompt
                    + "\n\nYour previous response failed to parse as valid JSON matching the required shape. Error: "
                    + lastError + "\nRespond again with only the corrected JSON object.";
            try {
                LlmClient.LlmResponse response = llmClient.create(new LlmClient.LlmRequest(
                        "", List.of(new LlmClient.LlmMessage("user", userPrompt)), List.of()));
                JsonNode root = parseJsonObject(textContent(response));
                JsonNode suggestionsNode = root.get("suggestions");
                if (suggestionsNode == null || !suggestionsNode.isArray()) {
                    throw new IllegalArgumentException("suggestions must be an array");
                }
                Set<String> knownTaskIds = workflow.listTasks().stream().map(Task::id).collect(Collectors.toSet());
                List<AiModels.DependencySuggestion> suggestions = new ArrayList<>();
                for (JsonNode node : suggestionsNode) {
                    String fromTaskId = requiredText(node, "fromTaskId");
                    String toTaskId = requiredText(node, "toTaskId");
                    String reason = requiredText(node, "reason");
                    if (!knownTaskIds.contains(fromTaskId) || !knownTaskIds.contains(toTaskId)) {
                        throw new IllegalArgumentException("suggested task ids must exist in the current board");
                    }
                    boolean alreadyExists = workflow.listDependencies().stream()
                            .anyMatch(edge -> edge.fromTaskId().equals(fromTaskId) && edge.toTaskId().equals(toTaskId));
                    suggestions.add(new AiModels.DependencySuggestion(
                            fromTaskId, toTaskId, reason, workflow.wouldCreateCycle(fromTaskId, toTaskId), alreadyExists));
                }
                return new AiModels.SuggestionOutcome(true, suggestions, null);
            } catch (AiUnavailableException exception) {
                throw exception;
            } catch (Exception exception) {
                lastError = safeMessage(exception);
            }
        }
        return new AiModels.SuggestionOutcome(false, List.of(),
                "No suggestion available: the model's response could not be parsed after a retry (" + lastError + ").");
    }

    public AiModels.DriftOutcome detectDrift() {
        List<Task> tasks = workflow.listTasks();
        List<Dependency> dependencies = workflow.listDependencies();
        String prompt = driftPrompt(tasks, dependencies);
        String lastError = null;
        Set<String> knownTaskIds = tasks.stream().map(Task::id).collect(Collectors.toSet());

        for (int attempt = 0; attempt < 2; attempt++) {
            String userPrompt = attempt == 0 ? prompt : prompt
                    + "\n\nYour previous response failed to parse. Error: " + lastError
                    + "\nRespond again with only the corrected JSON object.";
            try {
                LlmClient.LlmResponse response = llmClient.create(new LlmClient.LlmRequest(
                        "", List.of(new LlmClient.LlmMessage("user", userPrompt)), List.of()));
                JsonNode root = parseJsonObject(textContent(response));
                JsonNode findingsNode = root.get("findings");
                if (findingsNode == null || !findingsNode.isArray()) {
                    throw new IllegalArgumentException("findings must be an array");
                }
                List<AiModels.DriftFinding> findings = new ArrayList<>();
                for (JsonNode node : findingsNode) {
                    String taskId = requiredText(node, "taskId");
                    String type = requiredText(node, "type");
                    if (!Set.of("implied_but_missing_edge", "edge_with_no_textual_justification").contains(type)) {
                        throw new IllegalArgumentException("invalid drift finding type");
                    }
                    JsonNode relatedNode = node.get("relatedTaskId");
                    String relatedTaskId = relatedNode == null || relatedNode.isNull() ? null : requiredText(node, "relatedTaskId");
                    String explanation = requiredText(node, "explanation");
                    if (!knownTaskIds.contains(taskId) || (relatedTaskId != null && !knownTaskIds.contains(relatedTaskId))) {
                        throw new IllegalArgumentException("drift findings must refer to tasks in the current board");
                    }
                    findings.add(new AiModels.DriftFinding(taskId, type, relatedTaskId, explanation));
                }
                return new AiModels.DriftOutcome(true, findings, null);
            } catch (AiUnavailableException exception) {
                throw exception;
            } catch (Exception exception) {
                lastError = safeMessage(exception);
            }
        }
        return new AiModels.DriftOutcome(false, List.of(),
                "Drift report unavailable: the model's response could not be parsed after a retry (" + lastError + ").");
    }

    public AiModels.InvestigatorOutcome investigateImpact(String question) {
        List<AiModels.ToolCall> toolCalls = new ArrayList<>();
        List<LlmClient.LlmMessage> messages = new ArrayList<>();
        messages.add(new LlmClient.LlmMessage("user", question));
        List<Map<String, Object>> tools = toolDefinitions();

        for (int round = 0; round < MAX_TOOL_ROUNDS; round++) {
            LlmClient.LlmResponse response = llmClient.create(new LlmClient.LlmRequest(INVESTIGATOR_SYSTEM_PROMPT, messages, tools));
            List<Map<String, Object>> requestedTools = response.content().stream()
                    .filter(block -> "tool_use".equals(block.get("type"))).toList();
            if (requestedTools.isEmpty() || !"tool_use".equals(response.stopReason())) {
                String answer = textContent(response).trim();
                return new AiModels.InvestigatorOutcome(answer.isEmpty() ? "(no answer produced)" : answer, toolCalls);
            }

            messages.add(new LlmClient.LlmMessage("assistant", response.content()));
            List<Map<String, Object>> toolResults = new ArrayList<>();
            for (Map<String, Object> request : requestedTools) {
                String name = String.valueOf(request.get("name"));
                Object input = request.get("input");
                Object result;
                try {
                    result = executeTool(name, asObjectMap(input));
                } catch (Exception exception) {
                    result = Map.of("error", safeMessage(exception));
                }
                toolCalls.add(new AiModels.ToolCall(name, input, result));
                toolResults.add(Map.of(
                        "type", "tool_result",
                        "tool_use_id", String.valueOf(request.get("id")),
                        "content", writeJson(result)));
            }
            messages.add(new LlmClient.LlmMessage("user", toolResults));
        }
        return new AiModels.InvestigatorOutcome(
                "Investigation did not converge within the tool-call round limit. Try a more specific question.", toolCalls);
    }

    private Object executeTool(String name, Map<String, Object> input) {
        return switch (name) {
            case "getTaskDependencies" -> workflow.getTaskDependencies(requiredInputText(input, "taskId"));
            case "getUpstreamTasks" -> workflow.getUpstreamTasks(requiredInputText(input, "taskId"));
            case "getDownstreamTasks" -> workflow.getDownstreamTasks(requiredInputText(input, "taskId"));
            case "getBlockedTasks" -> workflow.getBlockedTasks();
            case "getCriticalPath" -> workflow.getCriticalPath();
            case "simulateScheduleChange" -> workflow.simulateScheduleChange(
                    requiredInputText(input, "taskId"), requiredInputInt(input, "deltaDays"));
            case "checkCycle" -> Map.of("wouldCreateCycle", workflow.wouldCreateCycle(
                    requiredInputText(input, "fromTaskId"), requiredInputText(input, "toTaskId")));
            case "listTasks" -> workflow.listTasks();
            default -> Map.of("error", "unknown tool " + name);
        };
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asObjectMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) throw new IllegalArgumentException("tool input must be an object");
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) result.put(String.valueOf(entry.getKey()), entry.getValue());
        return result;
    }

    private String requiredInputText(Map<String, Object> input, String field) {
        Object value = input.get(field);
        if (!(value instanceof String text) || text.isBlank()) throw new IllegalArgumentException(field + " is required");
        return text;
    }

    private int requiredInputInt(Map<String, Object> input, String field) {
        Object value = input.get(field);
        if (!(value instanceof Number number) || number.doubleValue() != Math.rint(number.doubleValue())) {
            throw new IllegalArgumentException(field + " must be an integer");
        }
        return number.intValue();
    }

    private JsonNode parseJsonObject(String responseText) throws Exception {
        int firstBrace = responseText.indexOf('{');
        int lastBrace = responseText.lastIndexOf('}');
        String json = firstBrace >= 0 && lastBrace >= firstBrace ? responseText.substring(firstBrace, lastBrace + 1) : responseText;
        JsonNode parsed = objectMapper.readTree(json);
        if (parsed == null || !parsed.isObject()) throw new IllegalArgumentException("response must be a JSON object");
        return parsed;
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException(field + " must be a non-empty string");
        }
        return value.asText();
    }

    private String textContent(LlmClient.LlmResponse response) {
        return response.content().stream()
                .filter(block -> "text".equals(block.get("type")))
                .map(block -> Objects.toString(block.get("text"), ""))
                .collect(Collectors.joining("\n"));
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            return "{\"error\":\"tool result could not be serialized\"}";
        }
    }

    private String safeMessage(Exception exception) {
        return exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
    }

    private String suggestionPrompt(Task task, List<Task> existingTasks) {
        String existing = existingTasks.stream().map(item -> "  " + item.id() + ": " + item.title())
                .collect(Collectors.joining("\n"));
        return """
                You are helping plan a dependency graph for a Kanban project called TaskFlow Pro.

                New task:
                  title: %s
                  description: %s

                Existing tasks (id: title):
                %s

                Propose candidate dependency edges involving the new task. Only propose edges with reasonable
                evidence from titles or description; do not invent unfounded relationships.

                Respond with only a JSON object in exactly this shape:
                {"suggestions": [{"fromTaskId": "<id>", "toTaskId": "<id>", "reason": "<short reason>"}]}

                If no relationships are apparent, respond with {"suggestions": []}.
                """.formatted(task.title(), task.description(), existing.isEmpty() ? "  (none yet)" : existing);
    }

    private String driftPrompt(List<Task> tasks, List<Dependency> dependencies) {
        String taskLines = tasks.stream().map(task -> "  " + task.id() + ": " + task.title() + " — "
                + (task.description().isBlank() ? "(no description)" : task.description())).collect(Collectors.joining("\n"));
        String edgeLines = dependencies.stream().map(edge -> "  " + edge.fromTaskId() + " -> " + edge.toTaskId())
                .collect(Collectors.joining("\n"));
        return """
                You are auditing a project's dependency graph for drift between descriptions and persisted edges.
                Look for language such as waiting on, blocked by, requires X, or after Y ships.

                Tasks (id: title — description):
                %s

                Persisted edges (prerequisite -> dependent):
                %s

                Find only these two types: implied_but_missing_edge, and edge_with_no_textual_justification.
                Only report findings tied to specific text. Respond with only JSON in exactly this shape:
                {"findings": [{"taskId": "<id>", "type": "implied_but_missing_edge", "relatedTaskId": "<id or null>", "explanation": "<short>"}]}
                If nothing is found, respond with {"findings": []}.
                """.formatted(taskLines.isEmpty() ? "  (none)" : taskLines, edgeLines.isEmpty() ? "  (none)" : edgeLines);
    }

    private List<Map<String, Object>> toolDefinitions() {
        return List.of(
                tool("getTaskDependencies", "Get upstream and downstream tasks for a task.", schema(Map.of("taskId", stringSchema()), "taskId")),
                tool("getUpstreamTasks", "Get all transitive prerequisite tasks.", schema(Map.of("taskId", stringSchema()), "taskId")),
                tool("getDownstreamTasks", "Get all transitive dependent tasks.", schema(Map.of("taskId", stringSchema()), "taskId")),
                tool("getBlockedTasks", "List every blocked task.", schema(Map.of())),
                tool("getCriticalPath", "Compute the longest path through the dependency graph.", schema(Map.of())),
                tool("simulateScheduleChange", "Read-only schedule simulation. Always use it for schedule impact.",
                        schema(Map.of("taskId", stringSchema(), "deltaDays", Map.of("type", "integer")), "taskId", "deltaDays")),
                tool("checkCycle", "Check whether a proposed dependency would create a cycle.",
                        schema(Map.of("fromTaskId", stringSchema(), "toTaskId", stringSchema()), "fromTaskId", "toTaskId")),
                tool("listTasks", "List all board tasks.", schema(Map.of())));
    }

    private Map<String, Object> tool(String name, String description, Map<String, Object> inputSchema) {
        return Map.of("name", name, "description", description, "input_schema", inputSchema);
    }

    private Map<String, Object> schema(Map<String, Object> properties, String... required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        if (required.length > 0) schema.put("required", List.of(required));
        return schema;
    }

    private Map<String, Object> stringSchema() {
        return Map.of("type", "string");
    }
}
