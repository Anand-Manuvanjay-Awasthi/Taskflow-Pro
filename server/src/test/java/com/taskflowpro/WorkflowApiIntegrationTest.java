package com.taskflowpro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:sqlite:file:workflow-api-tests?mode=memory&cache=shared")
@SuppressWarnings({"rawtypes", "unchecked"})
class WorkflowApiIntegrationTest {
    @Autowired private TestRestTemplate rest;
    @Autowired private JdbcTemplate jdbc;
    @LocalServerPort private int port;

    @BeforeEach
    void clearDatabase() {
        jdbc.update("DELETE FROM task_state_log");
        jdbc.update("DELETE FROM dependencies");
        jdbc.update("DELETE FROM tasks");
    }

    @Test
    void healthAndTaskDependencyLifecycleUseExpectedJsonContract() {
        assertEquals(HttpStatus.OK, get("/api/health", Map.class).getStatusCode());
        Map<String, Object> first = createTask("Design schema");
        Map<String, Object> second = createTask("Build API");
        String firstId = String.valueOf(first.get("id"));
        String secondId = String.valueOf(second.get("id"));
        assertEquals("ready", first.get("status"));

        ResponseEntity<Map> dependency = post("/api/dependencies", Map.of("fromTaskId", firstId, "toTaskId", secondId), Map.class);
        assertEquals(HttpStatus.CREATED, dependency.getStatusCode());
        assertEquals("manual", dependency.getBody().get("source"));

        ResponseEntity<Map> blocked = get("/api/tasks/" + secondId, Map.class);
        assertEquals("blocked", blocked.getBody().get("status"));
        ResponseEntity<Map> moved = rest.exchange(url("/api/tasks/" + firstId + "/column"), HttpMethod.PATCH,
                new HttpEntity<>(Map.of("column", "done")), Map.class);
        assertEquals(HttpStatus.OK, moved.getStatusCode());
        assertEquals("ready", ((Map<?, ?>) moved.getBody().get("task")).get("status"));
        assertEquals("ready", get("/api/tasks/" + secondId, Map.class).getBody().get("status"));
    }

    @Test
    void exposesReadOnlyAndPersistingScheduleEndpoints() {
        Map<String, Object> task = createTask("Scheduled work", "2026-01-01", 2);
        String id = String.valueOf(task.get("id"));
        ResponseEntity<Map> simulation = post("/api/tasks/" + id + "/simulate-schedule-change", Map.of("deltaDays", 3), Map.class);
        List<?> simulationResults = (List<?>) simulation.getBody().get("results");
        assertEquals("2026-01-04", ((Map<?, ?>) simulationResults.getFirst()).get("newStartDate"));
        assertEquals("2026-01-01", get("/api/tasks/" + id, Map.class).getBody().get("startDate"));

        ResponseEntity<Map> applied = post("/api/tasks/" + id + "/shift-schedule", Map.of("deltaDays", 3), Map.class);
        assertEquals(HttpStatus.OK, applied.getStatusCode());
        assertEquals("2026-01-04", get("/api/tasks/" + id, Map.class).getBody().get("startDate"));
    }

    @Test
    void returnsClear4xxErrorsForInvalidInputAndCycles() {
        ResponseEntity<Map> blank = post("/api/tasks", Map.of("title", ""), Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, blank.getStatusCode());
        assertTrue(String.valueOf(blank.getBody().get("error")).contains("title"));

        Map<String, Object> a = createTask("A");
        Map<String, Object> b = createTask("B");
        post("/api/dependencies", Map.of("fromTaskId", a.get("id"), "toTaskId", b.get("id")), Map.class);
        ResponseEntity<Map> cycle = post("/api/dependencies", Map.of("fromTaskId", b.get("id"), "toTaskId", a.get("id")), Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, cycle.getStatusCode());
        assertTrue(String.valueOf(cycle.getBody().get("error")).contains("cycle"));
    }

    private Map<String, Object> createTask(String title) {
        return createTask(title, null, 1);
    }

    private Map<String, Object> createTask(String title, String startDate, int duration) {
        java.util.LinkedHashMap<String, Object> input = new java.util.LinkedHashMap<>();
        input.put("title", title);
        input.put("duration", duration);
        if (startDate != null) input.put("startDate", startDate);
        ResponseEntity<Map> response = post("/api/tasks", input, Map.class);
        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertNotNull(response.getBody().get("id"));
        return response.getBody();
    }

    private <T> ResponseEntity<T> get(String path, Class<T> type) {
        return rest.getForEntity(url(path), type);
    }

    private <T> ResponseEntity<T> post(String path, Object body, Class<T> type) {
        return rest.postForEntity(url(path), body, type);
    }

    private String url(String path) {
        return "http://localhost:" + port + path;
    }
}
