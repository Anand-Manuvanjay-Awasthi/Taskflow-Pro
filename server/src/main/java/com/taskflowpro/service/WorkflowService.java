package com.taskflowpro.service;

import com.taskflowpro.data.WorkflowRepository;
import com.taskflowpro.domain.ColumnName;
import com.taskflowpro.domain.CriticalPath;
import com.taskflowpro.domain.Dependency;
import com.taskflowpro.domain.DependencySource;
import com.taskflowpro.domain.GraphSnapshot;
import com.taskflowpro.domain.ScheduleShiftResult;
import com.taskflowpro.domain.Task;
import com.taskflowpro.domain.TaskStatus;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The sole authoritative entry point for workflow graph mutations. HTTP and
 * AI layers both use this service, so validation and DAG invariants cannot be
 * bypassed by an alternate caller.
 */
@Service
public class WorkflowService {
    private final WorkflowRepository repository;

    public WorkflowService(WorkflowRepository repository) {
        this.repository = repository;
    }

    private GraphSnapshot snapshot() {
        return GraphAlgorithms.snapshot(repository.listTasks(), repository.listDependencies());
    }

    @Transactional
    public Task createTask(String title, String description, String startDate, Integer duration) {
        if (title == null || title.trim().isEmpty()) throw new ValidationException("title is required");
        int resolvedDuration = duration == null ? 1 : duration;
        if (resolvedDuration < 1) throw new ValidationException("duration must be a positive integer");
        Task task = repository.createTask(title.trim(), description == null ? "" : description, startDate, resolvedDuration);
        repository.logStateChange(task.id(), null, task.status());
        return task;
    }

    public List<Task> listTasks() {
        return repository.listTasks();
    }

    public Task getTask(String id) {
        return repository.findTask(id).orElseThrow(() -> new NotFoundException("task " + id + " not found"));
    }

    @Transactional
    public MoveTaskResult moveTaskColumn(String id, ColumnName column) {
        getTask(id);
        repository.updateTaskColumn(id, column);
        Map<String, TaskStatus> recomputed = GraphAlgorithms.recomputeAffectedDescendants(snapshot(), id);
        persistStatusChanges(recomputed);
        List<MoveTaskResult.RecomputedStatus> response = recomputed.entrySet().stream()
                .map(entry -> new MoveTaskResult.RecomputedStatus(entry.getKey(), entry.getValue().value()))
                .toList();
        return new MoveTaskResult(getTask(id), response);
    }

    @Transactional
    public Dependency createDependency(String fromTaskId, String toTaskId, DependencySource source) {
        if (fromTaskId.equals(toTaskId)) throw new ValidationException("a task cannot depend on itself");
        getTask(fromTaskId);
        getTask(toTaskId);
        if (repository.dependencyExists(fromTaskId, toTaskId)) {
            throw new ValidationException("this dependency already exists");
        }
        if (GraphAlgorithms.wouldCreateCycle(snapshot(), fromTaskId, toTaskId)) {
            throw new ValidationException("adding this dependency would create a cycle ("
                    + toTaskId + " is already an ancestor of " + fromTaskId + ")");
        }
        Dependency dependency = repository.createDependency(fromTaskId, toTaskId,
                source == null ? DependencySource.MANUAL : source);
        persistStatusChanges(GraphAlgorithms.recomputeAffectedDescendants(snapshot(), toTaskId));
        return dependency;
    }

    public List<Dependency> listDependencies() {
        return repository.listDependencies();
    }

    public boolean wouldCreateCycle(String fromTaskId, String toTaskId) {
        return GraphAlgorithms.wouldCreateCycle(snapshot(), fromTaskId, toTaskId);
    }

    @Transactional
    public List<ScheduleShiftResult> shiftSchedule(String taskId, int deltaDays) {
        getTask(taskId);
        List<ScheduleShiftResult> results = GraphAlgorithms.propagateScheduleShift(snapshot(), taskId, deltaDays);
        for (ScheduleShiftResult result : results) {
            if (result.shiftDays() != 0 && !java.util.Objects.equals(result.oldStartDate(), result.newStartDate())) {
                repository.updateTaskSchedule(result.taskId(), result.newStartDate());
            }
        }
        return results;
    }

    public List<ScheduleShiftResult> simulateScheduleChange(String taskId, int deltaDays) {
        getTask(taskId);
        return GraphAlgorithms.propagateScheduleShift(snapshot(), taskId, deltaDays);
    }

    public List<Task> getUpstreamTasks(String taskId) {
        getTask(taskId);
        GraphSnapshot graph = snapshot();
        return traverse(graph.edgesTo(), graph, taskId);
    }

    public List<Task> getDownstreamTasks(String taskId) {
        getTask(taskId);
        GraphSnapshot graph = snapshot();
        return traverse(graph.edgesFrom(), graph, taskId);
    }

    private List<Task> traverse(Map<String, List<String>> adjacency, GraphSnapshot graph, String rootId) {
        Set<String> visited = new HashSet<>();
        Queue<String> queue = new ArrayDeque<>(adjacency.getOrDefault(rootId, List.of()));
        List<Task> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            String current = queue.remove();
            if (!visited.add(current)) continue;
            Task task = graph.tasks().get(current);
            if (task != null) result.add(task);
            queue.addAll(adjacency.getOrDefault(current, List.of()));
        }
        return result;
    }

    public List<Task> getBlockedTasks() {
        return repository.listTasks().stream().filter(task -> task.status() == TaskStatus.BLOCKED).toList();
    }

    public Map<String, List<Task>> getTaskDependencies(String taskId) {
        return Map.of("upstream", getUpstreamTasks(taskId), "downstream", getDownstreamTasks(taskId));
    }

    public CriticalPath getCriticalPath() {
        GraphSnapshot graph = snapshot();
        Map<String, Integer> inDegree = new LinkedHashMap<>();
        for (String id : graph.tasks().keySet()) inDegree.put(id, 0);
        for (String id : graph.tasks().keySet()) {
            for (String dependent : graph.edgesFrom().getOrDefault(id, List.of())) {
                inDegree.compute(dependent, (ignored, degree) -> degree + 1);
            }
        }
        Queue<String> queue = new ArrayDeque<>();
        inDegree.forEach((id, degree) -> { if (degree == 0) queue.add(id); });
        List<String> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            String current = queue.remove();
            order.add(current);
            for (String dependent : graph.edgesFrom().getOrDefault(current, List.of())) {
                int degree = inDegree.compute(dependent, (ignored, value) -> value - 1);
                if (degree == 0) queue.add(dependent);
            }
        }
        Map<String, Integer> best = new HashMap<>();
        Map<String, String> previous = new HashMap<>();
        for (String id : order) {
            int bestPreviousDuration = 0;
            String bestPrevious = null;
            for (String prerequisite : graph.edgesTo().getOrDefault(id, List.of())) {
                int duration = best.getOrDefault(prerequisite, 0);
                if (duration > bestPreviousDuration) {
                    bestPreviousDuration = duration;
                    bestPrevious = prerequisite;
                }
            }
            best.put(id, bestPreviousDuration + graph.tasks().get(id).duration());
            previous.put(id, bestPrevious);
        }
        String endNode = null;
        int totalDuration = 0;
        for (Map.Entry<String, Integer> entry : best.entrySet()) {
            if (entry.getValue() > totalDuration) {
                endNode = entry.getKey();
                totalDuration = entry.getValue();
            }
        }
        List<String> path = new ArrayList<>();
        while (endNode != null) {
            path.add(0, endNode);
            endNode = previous.get(endNode);
        }
        return new CriticalPath(path, totalDuration);
    }

    private void persistStatusChanges(Map<String, TaskStatus> recomputed) {
        for (Map.Entry<String, TaskStatus> entry : recomputed.entrySet()) {
            Task existing = getTask(entry.getKey());
            if (existing.status() != entry.getValue()) {
                repository.updateTaskStatus(entry.getKey(), entry.getValue());
                repository.logStateChange(entry.getKey(), existing.status(), entry.getValue());
            }
        }
    }
}
