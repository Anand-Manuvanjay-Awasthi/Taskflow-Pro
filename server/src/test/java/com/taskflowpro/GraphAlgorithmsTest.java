package com.taskflowpro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.taskflowpro.domain.ColumnName;
import com.taskflowpro.domain.Dependency;
import com.taskflowpro.domain.DependencySource;
import com.taskflowpro.domain.GraphSnapshot;
import com.taskflowpro.domain.Task;
import com.taskflowpro.domain.TaskStatus;
import com.taskflowpro.service.GraphAlgorithms;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GraphAlgorithmsTest {
    private Task task(String id) {
        return task(id, ColumnName.BACKLOG, "2026-01-01");
    }

    private Task task(String id, ColumnName column, String startDate) {
        return new Task(id, id, "", column, TaskStatus.BLOCKED, startDate, 2,
                "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
    }

    private Dependency edge(String id, String from, String to) {
        return new Dependency(id, from, to, "2026-01-01T00:00:00Z", DependencySource.MANUAL);
    }

    @Test
    void detectsDirectAndLongerCycles() {
        GraphSnapshot direct = GraphAlgorithms.snapshot(List.of(task("A"), task("B")), List.of(edge("ab", "A", "B")));
        GraphSnapshot longer = GraphAlgorithms.snapshot(List.of(task("A"), task("B"), task("C")),
                List.of(edge("ab", "A", "B"), edge("bc", "B", "C")));
        assertTrue(GraphAlgorithms.wouldCreateCycle(direct, "B", "A"));
        assertTrue(GraphAlgorithms.wouldCreateCycle(longer, "C", "A"));
        assertTrue(GraphAlgorithms.graphHasCycle(GraphAlgorithms.snapshot(List.of(task("A"), task("B")),
                List.of(edge("ab", "A", "B"), edge("ba", "B", "A")))));
    }

    @Test
    void rejectsSelfReferenceButAcceptsValidDiamondEdges() {
        GraphSnapshot graph = GraphAlgorithms.snapshot(List.of(task("A"), task("B"), task("C"), task("D")),
                List.of(edge("ab", "A", "B"), edge("ac", "A", "C")));
        assertTrue(GraphAlgorithms.wouldCreateCycle(graph, "A", "A"));
        assertFalse(GraphAlgorithms.wouldCreateCycle(graph, "B", "D"));
        assertFalse(GraphAlgorithms.wouldCreateCycle(graph, "C", "D"));
        assertFalse(GraphAlgorithms.graphHasCycle(graph));
    }

    @Test
    void computesReadyAndBlockedFromAllDirectPrerequisites() {
        GraphSnapshot noPrerequisite = GraphAlgorithms.snapshot(List.of(task("A")), List.of());
        assertEquals(TaskStatus.READY, GraphAlgorithms.computeStatus(noPrerequisite, "A"));

        GraphSnapshot oneIncomplete = GraphAlgorithms.snapshot(
                List.of(task("A", ColumnName.DONE, "2026-01-01"), task("B", ColumnName.IN_PROGRESS, "2026-01-01"), task("D")),
                List.of(edge("ad", "A", "D"), edge("bd", "B", "D")));
        assertEquals(TaskStatus.BLOCKED, GraphAlgorithms.computeStatus(oneIncomplete, "D"));

        GraphSnapshot complete = GraphAlgorithms.snapshot(
                List.of(task("A", ColumnName.DONE, "2026-01-01"), task("B", ColumnName.DONE, "2026-01-01"), task("D")),
                List.of(edge("ad", "A", "D"), edge("bd", "B", "D")));
        assertEquals(TaskStatus.READY, GraphAlgorithms.computeStatus(complete, "D"));
    }

    @Test
    void recomputesOnlyTheChangedTaskAndItsDescendants() {
        GraphSnapshot graph = GraphAlgorithms.snapshot(List.of(task("A"), task("B"), task("D"), task("X")),
                List.of(edge("ab", "A", "B"), edge("bd", "B", "D")));
        Map<String, TaskStatus> result = GraphAlgorithms.recomputeAffectedDescendants(graph, "A");
        assertEquals(List.of("A", "B", "D"), result.keySet().stream().toList());
        assertFalse(result.containsKey("X"));
    }

    @Test
    void propagatesAcrossDiamondWithoutCompounding() {
        GraphSnapshot graph = GraphAlgorithms.snapshot(List.of(
                task("A", ColumnName.BACKLOG, "2026-01-01"),
                task("B", ColumnName.BACKLOG, "2026-01-05"),
                task("C", ColumnName.BACKLOG, "2026-01-05"),
                task("D", ColumnName.BACKLOG, "2026-01-10")),
                List.of(edge("ab", "A", "B"), edge("ac", "A", "C"), edge("bd", "B", "D"), edge("cd", "C", "D")));
        var byId = GraphAlgorithms.propagateScheduleShift(graph, "A", 3).stream()
                .collect(java.util.stream.Collectors.toMap(result -> result.taskId(), result -> result));
        assertEquals(3, byId.get("D").shiftDays());
        assertEquals("2026-01-13", byId.get("D").newStartDate());
    }

    @Test
    void propagatesEarlierDatesWhenAllPrerequisitesMove() {
        GraphSnapshot graph = GraphAlgorithms.snapshot(List.of(
                task("A", ColumnName.BACKLOG, "2026-01-10"), task("B", ColumnName.BACKLOG, "2026-01-15")),
                List.of(edge("ab", "A", "B")));
        var byId = GraphAlgorithms.propagateScheduleShift(graph, "A", -3).stream()
                .collect(java.util.stream.Collectors.toMap(result -> result.taskId(), result -> result));
        assertEquals(-3, byId.get("B").shiftDays());
        assertEquals("2026-01-12", byId.get("B").newStartDate());
    }

    @Test
    void doesNotPullTaskEarlierPastAnUnchangedPrerequisite() {
        GraphSnapshot graph = GraphAlgorithms.snapshot(List.of(
                task("A", ColumnName.BACKLOG, "2026-01-10"),
                task("B", ColumnName.BACKLOG, "2026-01-15"),
                task("C", ColumnName.BACKLOG, "2026-01-15")),
                List.of(edge("ab", "A", "B"), edge("cb", "C", "B")));
        var byId = GraphAlgorithms.propagateScheduleShift(graph, "A", -3).stream()
                .collect(java.util.stream.Collectors.toMap(result -> result.taskId(), result -> result));
        assertEquals(0, byId.get("B").shiftDays());
        assertEquals("2026-01-15", byId.get("B").newStartDate());
        assertNull(byId.get("C"));
    }
}
