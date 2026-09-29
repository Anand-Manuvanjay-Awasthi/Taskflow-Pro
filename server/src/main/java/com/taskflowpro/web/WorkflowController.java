package com.taskflowpro.web;

import com.taskflowpro.domain.Dependency;
import com.taskflowpro.domain.DependencySource;
import com.taskflowpro.domain.Task;
import com.taskflowpro.service.MoveTaskResult;
import com.taskflowpro.service.WorkflowService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class WorkflowController {
    private final WorkflowService workflow;

    public WorkflowController(WorkflowService workflow) {
        this.workflow = workflow;
    }

    @GetMapping("/health")
    public Map<String, Boolean> health() {
        return Map.of("ok", true);
    }

    @GetMapping("/tasks")
    public List<Task> listTasks() {
        return workflow.listTasks();
    }

    @PostMapping("/tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public Task createTask(@Valid @RequestBody CreateTaskRequest request) {
        return workflow.createTask(request.title(), request.description(), request.startDate(), request.duration());
    }

    @GetMapping("/tasks/{id}")
    public Task getTask(@PathVariable String id) {
        return workflow.getTask(id);
    }

    @PatchMapping("/tasks/{id}/column")
    public MoveTaskResult moveTaskColumn(@PathVariable String id, @Valid @RequestBody MoveColumnRequest request) {
        return workflow.moveTaskColumn(id, request.column());
    }

    @GetMapping("/dependencies")
    public List<Dependency> listDependencies() {
        return workflow.listDependencies();
    }

    @PostMapping("/dependencies")
    @ResponseStatus(HttpStatus.CREATED)
    public Dependency createDependency(@Valid @RequestBody CreateDependencyRequest request) {
        return workflow.createDependency(request.fromTaskId(), request.toTaskId(), DependencySource.MANUAL);
    }

    @PostMapping("/tasks/{id}/simulate-schedule-change")
    public Map<String, Object> simulateScheduleChange(@PathVariable String id, @Valid @RequestBody ScheduleShiftRequest request) {
        return Map.of("results", workflow.simulateScheduleChange(id, request.deltaDays()));
    }

    @PostMapping("/tasks/{id}/shift-schedule")
    public Map<String, Object> shiftSchedule(@PathVariable String id, @Valid @RequestBody ScheduleShiftRequest request) {
        return Map.of("results", workflow.shiftSchedule(id, request.deltaDays()));
    }

    @GetMapping("/tasks/{id}/upstream")
    public List<Task> getUpstreamTasks(@PathVariable String id) {
        return workflow.getUpstreamTasks(id);
    }

    @GetMapping("/tasks/{id}/downstream")
    public List<Task> getDownstreamTasks(@PathVariable String id) {
        return workflow.getDownstreamTasks(id);
    }

    @GetMapping("/blocked-tasks")
    public List<Task> getBlockedTasks() {
        return workflow.getBlockedTasks();
    }

    @GetMapping("/critical-path")
    public Object getCriticalPath() {
        return workflow.getCriticalPath();
    }
}
