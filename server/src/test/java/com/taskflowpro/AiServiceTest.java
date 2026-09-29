package com.taskflowpro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflowpro.ai.AiModels;
import com.taskflowpro.ai.AiService;
import com.taskflowpro.ai.LlmClient;
import com.taskflowpro.service.WorkflowService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:file:ai-service-tests?mode=memory&cache=shared")
class AiServiceTest {
    @Autowired private WorkflowService workflow;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper objectMapper;

    @BeforeEach
    void clearDatabase() {
        jdbc.update("DELETE FROM task_state_log");
        jdbc.update("DELETE FROM dependencies");
        jdbc.update("DELETE FROM tasks");
    }

    @Test
    void groundsWellFormedDependencySuggestionAgainstRealCycleCheck() {
        var a = workflow.createTask("Design schema", null, null, 1);
        var b = workflow.createTask("Build API", null, null, 1);
        AiService service = serviceWith(text("""
                {"suggestions":[{"fromTaskId":"%s","toTaskId":"%s","reason":"API needs schema"}]}
                """.formatted(a.id(), b.id())));
        AiModels.SuggestionOutcome outcome = service.suggestDependencies(b.id());
        assertTrue(outcome.ok());
        assertEquals(1, outcome.suggestions().size());
        assertFalse(outcome.suggestions().getFirst().wouldCreateCycle());
    }

    @Test
    void flagsAcyclicityFailureInSuggestionWithoutPersistingAnything() {
        var a = workflow.createTask("A", null, null, 1);
        var b = workflow.createTask("B", null, null, 1);
        workflow.createDependency(a.id(), b.id(), null);
        AiService service = serviceWith(text("""
                {"suggestions":[{"fromTaskId":"%s","toTaskId":"%s","reason":"bad edge"}]}
                """.formatted(b.id(), a.id())));
        AiModels.SuggestionOutcome outcome = service.suggestDependencies(a.id());
        assertTrue(outcome.suggestions().getFirst().wouldCreateCycle());
        assertEquals(1, workflow.listDependencies().size());
    }

    @Test
    void retriesMalformedSuggestionOnceThenFallsBackCleanly() {
        var task = workflow.createTask("A", null, null, 1);
        FakeClient retryClient = new FakeClient(List.of(text("not json"), text("{\"suggestions\":[]}")));
        AiModels.SuggestionOutcome retryOutcome = new AiService(workflow, retryClient, objectMapper).suggestDependencies(task.id());
        assertTrue(retryOutcome.ok());
        assertEquals(2, retryClient.requests.size());

        AiModels.SuggestionOutcome failedOutcome = serviceWith(text("still bad"), text("also bad")).suggestDependencies(task.id());
        assertFalse(failedOutcome.ok());
        assertTrue(failedOutcome.message().contains("No suggestion available"));
    }

    @Test
    void impactInvestigatorUsesReadOnlyScheduleTool() {
        var a = workflow.createTask("Database migration", null, "2026-01-01", 3);
        var b = workflow.createTask("API integration", null, "2026-01-05", 2);
        workflow.createDependency(a.id(), b.id(), null);
        AiService service = serviceWith(
                toolUse("call_1", "simulateScheduleChange", Map.of("taskId", a.id(), "deltaDays", 4)),
                text("API integration would shift by 4 days."));
        AiModels.InvestigatorOutcome outcome = service.investigateImpact("what happens if migration slips?");
        assertEquals(1, outcome.toolCalls().size());
        assertEquals("simulateScheduleChange", outcome.toolCalls().getFirst().name());
        assertTrue(outcome.answer().contains("4 days"));
        assertEquals("2026-01-05", workflow.getTask(b.id()).startDate());
    }

    @Test
    void impactInvestigatorStopsAfterBoundedToolRounds() {
        AiService service = serviceWith(
                toolUse("1", "getBlockedTasks", Map.of()), toolUse("2", "getBlockedTasks", Map.of()),
                toolUse("3", "getBlockedTasks", Map.of()), toolUse("4", "getBlockedTasks", Map.of()),
                toolUse("5", "getBlockedTasks", Map.of()), toolUse("6", "getBlockedTasks", Map.of()));
        AiModels.InvestigatorOutcome outcome = service.investigateImpact("loop forever");
        assertEquals(6, outcome.toolCalls().size());
        assertTrue(outcome.answer().contains("did not converge"));
    }

    @Test
    void detectsGroundedDriftAndHandlesMalformedOutput() {
        var a = workflow.createTask("Set up database", null, null, 1);
        var b = workflow.createTask("Build API", "Blocked by the database setup task.", null, 1);
        AiService service = serviceWith(text("""
                {"findings":[{"taskId":"%s","type":"implied_but_missing_edge","relatedTaskId":"%s","explanation":"Description identifies the database prerequisite."}]}
                """.formatted(b.id(), a.id())));
        AiModels.DriftOutcome outcome = service.detectDrift();
        assertTrue(outcome.ok());
        assertEquals("implied_but_missing_edge", outcome.findings().getFirst().type());

        AiModels.DriftOutcome failedOutcome = serviceWith(text("not json"), text("not json either")).detectDrift();
        assertFalse(failedOutcome.ok());
        assertTrue(failedOutcome.message().contains("Drift report unavailable"));
    }

    private AiService serviceWith(LlmClient.LlmResponse... responses) {
        return new AiService(workflow, new FakeClient(List.of(responses)), objectMapper);
    }

    private LlmClient.LlmResponse text(String content) {
        return new LlmClient.LlmResponse(List.of(Map.of("type", "text", "text", content)), "end_turn");
    }

    private LlmClient.LlmResponse toolUse(String id, String name, Map<String, Object> input) {
        return new LlmClient.LlmResponse(List.of(Map.of("type", "tool_use", "id", id, "name", name, "input", input)), "tool_use");
    }

    private static class FakeClient implements LlmClient {
        private final List<LlmResponse> responses;
        private final List<LlmRequest> requests = new ArrayList<>();
        private int calls;

        FakeClient(List<LlmResponse> responses) {
            this.responses = responses;
        }

        @Override
        public LlmResponse create(LlmRequest request) {
            requests.add(request);
            return responses.get(Math.min(calls++, responses.size() - 1));
        }
    }
}
