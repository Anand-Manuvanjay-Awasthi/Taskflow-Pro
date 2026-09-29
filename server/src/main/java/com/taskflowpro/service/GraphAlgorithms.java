package com.taskflowpro.service;

import com.taskflowpro.domain.ColumnName;
import com.taskflowpro.domain.Dependency;
import com.taskflowpro.domain.GraphSnapshot;
import com.taskflowpro.domain.ScheduleShiftResult;
import com.taskflowpro.domain.Task;
import com.taskflowpro.domain.TaskStatus;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

/** Pure DAG operations, deliberately decoupled from persistence and HTTP. */
public final class GraphAlgorithms {
    private GraphAlgorithms() { }

    public static GraphSnapshot snapshot(List<Task> tasks, List<Dependency> dependencies) {
        Map<String, Task> taskMap = new LinkedHashMap<>();
        Map<String, List<String>> edgesFrom = new LinkedHashMap<>();
        Map<String, List<String>> edgesTo = new LinkedHashMap<>();
        for (Task task : tasks) {
            taskMap.put(task.id(), task);
            edgesFrom.put(task.id(), new ArrayList<>());
            edgesTo.put(task.id(), new ArrayList<>());
        }
        for (Dependency dependency : dependencies) {
            List<String> outgoing = edgesFrom.get(dependency.fromTaskId());
            List<String> incoming = edgesTo.get(dependency.toTaskId());
            if (outgoing != null && incoming != null) {
                outgoing.add(dependency.toTaskId());
                incoming.add(dependency.fromTaskId());
            }
        }
        return new GraphSnapshot(taskMap, edgesFrom, edgesTo);
    }

    public static boolean wouldCreateCycle(GraphSnapshot graph, String fromTaskId, String toTaskId) {
        if (fromTaskId.equals(toTaskId)) return true;
        Set<String> visited = new HashSet<>();
        Queue<String> queue = new ArrayDeque<>();
        queue.add(toTaskId);
        visited.add(toTaskId);
        while (!queue.isEmpty()) {
            String current = queue.remove();
            if (current.equals(fromTaskId)) return true;
            for (String next : graph.edgesFrom().getOrDefault(current, List.of())) {
                if (visited.add(next)) queue.add(next);
            }
        }
        return false;
    }

    public static boolean graphHasCycle(GraphSnapshot graph) {
        Map<String, Integer> colour = new HashMap<>();
        for (String id : graph.tasks().keySet()) colour.put(id, 0);
        for (String id : graph.tasks().keySet()) {
            if (colour.get(id) == 0 && hasBackEdge(graph, id, colour)) return true;
        }
        return false;
    }

    private static boolean hasBackEdge(GraphSnapshot graph, String node, Map<String, Integer> colour) {
        colour.put(node, 1);
        for (String next : graph.edgesFrom().getOrDefault(node, List.of())) {
            int nextColour = colour.getOrDefault(next, 0);
            if (nextColour == 1 || (nextColour == 0 && hasBackEdge(graph, next, colour))) return true;
        }
        colour.put(node, 2);
        return false;
    }

    public static TaskStatus computeStatus(GraphSnapshot graph, String taskId) {
        for (String prerequisiteId : graph.edgesTo().getOrDefault(taskId, List.of())) {
            Task prerequisite = graph.tasks().get(prerequisiteId);
            if (prerequisite == null || prerequisite.column() != ColumnName.DONE) return TaskStatus.BLOCKED;
        }
        return TaskStatus.READY;
    }

    public static Map<String, TaskStatus> recomputeAffectedDescendants(GraphSnapshot graph, String changedTaskId) {
        Map<String, TaskStatus> result = new LinkedHashMap<>();
        Set<String> visited = new LinkedHashSet<>();
        Queue<String> queue = new ArrayDeque<>();
        queue.add(changedTaskId);
        visited.add(changedTaskId);
        while (!queue.isEmpty()) {
            String current = queue.remove();
            result.put(current, computeStatus(graph, current));
            for (String dependent : graph.edgesFrom().getOrDefault(current, List.of())) {
                if (visited.add(dependent)) queue.add(dependent);
            }
        }
        return result;
    }

    public static List<ScheduleShiftResult> propagateScheduleShift(GraphSnapshot graph, String sourceId, int deltaDays) {
        Set<String> descendants = collectDescendants(graph, sourceId);
        List<String> order = topologicalOrder(graph, descendants);
        Map<String, Integer> shifts = new HashMap<>();
        shifts.put(sourceId, deltaDays);

        for (String taskId : order) {
            if (taskId.equals(sourceId)) continue;
            Integer propagatedShift = null;
            boolean hasUnchangedPrerequisite = false;
            for (String prerequisite : graph.edgesTo().getOrDefault(taskId, List.of())) {
                if (descendants.contains(prerequisite)) {
                    int candidate = shifts.getOrDefault(prerequisite, 0);
                    propagatedShift = propagatedShift == null ? candidate : Math.max(propagatedShift, candidate);
                } else {
                    hasUnchangedPrerequisite = true;
                }
            }
            int netShift = propagatedShift == null ? 0 : propagatedShift;
            // An unchanged prerequisite prevents an earlier pull-in, but never masks a delay.
            if (hasUnchangedPrerequisite) netShift = Math.max(netShift, 0);
            shifts.put(taskId, netShift);
        }

        List<ScheduleShiftResult> results = new ArrayList<>();
        for (String taskId : order) {
            Task task = graph.tasks().get(taskId);
            int shiftDays = shifts.getOrDefault(taskId, 0);
            String oldDate = task == null ? null : task.startDate();
            String newDate = oldDate == null || shiftDays == 0 ? oldDate : addDays(oldDate, shiftDays);
            results.add(new ScheduleShiftResult(taskId, oldDate, newDate, shiftDays));
        }
        return results;
    }

    private static String addDays(String isoDate, int days) {
        try {
            return LocalDate.parse(isoDate).plusDays(days).toString();
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException("start date must be an ISO-8601 date: " + isoDate, exception);
        }
    }

    private static Set<String> collectDescendants(GraphSnapshot graph, String sourceId) {
        Set<String> result = new LinkedHashSet<>();
        Queue<String> queue = new ArrayDeque<>();
        result.add(sourceId);
        queue.add(sourceId);
        while (!queue.isEmpty()) {
            String current = queue.remove();
            for (String next : graph.edgesFrom().getOrDefault(current, List.of())) {
                if (result.add(next)) queue.add(next);
            }
        }
        return result;
    }

    private static List<String> topologicalOrder(GraphSnapshot graph, Set<String> subset) {
        Map<String, Integer> inDegree = new LinkedHashMap<>();
        for (String id : subset) inDegree.put(id, 0);
        for (String id : subset) {
            for (String next : graph.edgesFrom().getOrDefault(id, List.of())) {
                if (subset.contains(next)) inDegree.compute(next, (ignored, degree) -> degree + 1);
            }
        }
        Queue<String> queue = new ArrayDeque<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) queue.add(entry.getKey());
        }
        List<String> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            String current = queue.remove();
            order.add(current);
            for (String next : graph.edgesFrom().getOrDefault(current, List.of())) {
                if (!subset.contains(next)) continue;
                int degree = inDegree.compute(next, (ignored, value) -> value - 1);
                if (degree == 0) queue.add(next);
            }
        }
        if (order.size() != subset.size()) throw new IllegalStateException("graph contains a cycle");
        return order;
    }
}
