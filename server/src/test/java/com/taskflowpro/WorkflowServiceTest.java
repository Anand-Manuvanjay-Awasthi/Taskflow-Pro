package com.taskflowpro;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.taskflowpro.domain.ColumnName;
import com.taskflowpro.domain.TaskStatus;
import com.taskflowpro.service.NotFoundException;
import com.taskflowpro.service.ValidationException;
import com.taskflowpro.service.WorkflowService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:file:workflow-service-tests?mode=memory&cache=shared")
class WorkflowServiceTest {
    @Autowired private WorkflowService workflow;
    @Autowired private JdbcTemplate jdbc;

    @BeforeEach
    void clearDatabase() {
        jdbc.update("DELETE FROM task_state_log");
        jdbc.update("DELETE FROM dependencies");
        jdbc.update("DELETE FROM tasks");
    }

    @Test
    void createsTasksLinksDependencyAndUpdatesReadyState() {
        var prerequisite = workflow.createTask("Design schema", null, null, null);
        var dependent = workflow.createTask("Build API", null, null, null);
        assertEquals(TaskStatus.READY, prerequisite.status());
        workflow.createDependency(prerequisite.id(), dependent.id(), null);
        assertEquals(TaskStatus.BLOCKED, workflow.getTask(dependent.id()).status());
        workflow.moveTaskColumn(prerequisite.id(), ColumnName.DONE);
        assertEquals(TaskStatus.READY, workflow.getTask(dependent.id()).status());
    }

    @Test
    void rejectsCycleBeforeItIsPersisted() {
        var a = workflow.createTask("A", null, null, 1);
        var b = workflow.createTask("B", null, null, 1);
        workflow.createDependency(a.id(), b.id(), null);
        assertThrows(ValidationException.class, () -> workflow.createDependency(b.id(), a.id(), null));
        assertEquals(1, workflow.listDependencies().size());
    }

    @Test
    void rejectsSelfDuplicateAndUnknownDependencies() {
        var a = workflow.createTask("A", null, null, 1);
        var b = workflow.createTask("B", null, null, 1);
        assertThrows(ValidationException.class, () -> workflow.createDependency(a.id(), a.id(), null));
        assertThrows(NotFoundException.class, () -> workflow.createDependency(a.id(), "does-not-exist", null));
        workflow.createDependency(a.id(), b.id(), null);
        assertThrows(ValidationException.class, () -> workflow.createDependency(a.id(), b.id(), null));
    }

    @Test
    void rejectsBlankTitlesAndNonPositiveDurations() {
        assertThrows(ValidationException.class, () -> workflow.createTask(" ", null, null, 1));
        assertThrows(ValidationException.class, () -> workflow.createTask("A", null, null, 0));
    }

    @Test
    void simulatesWithoutPersistingAndAppliesDiamondShiftOnce() {
        var a = workflow.createTask("A", null, "2026-01-01", 2);
        var b = workflow.createTask("B", null, "2026-01-05", 2);
        var c = workflow.createTask("C", null, "2026-01-05", 2);
        var d = workflow.createTask("D", null, "2026-01-10", 2);
        workflow.createDependency(a.id(), b.id(), null);
        workflow.createDependency(a.id(), c.id(), null);
        workflow.createDependency(b.id(), d.id(), null);
        workflow.createDependency(c.id(), d.id(), null);

        assertEquals(3, workflow.simulateScheduleChange(a.id(), 3).stream()
                .filter(result -> result.taskId().equals(d.id())).findFirst().orElseThrow().shiftDays());
        assertEquals("2026-01-10", workflow.getTask(d.id()).startDate());
        workflow.shiftSchedule(a.id(), 3);
        assertEquals("2026-01-13", workflow.getTask(d.id()).startDate());
    }

    @Test
    void rollbackFromDoneReblocksDescendants() {
        var a = workflow.createTask("A", null, null, 1);
        var b = workflow.createTask("B", null, null, 1);
        workflow.createDependency(a.id(), b.id(), null);
        workflow.moveTaskColumn(a.id(), ColumnName.DONE);
        assertEquals(TaskStatus.READY, workflow.getTask(b.id()).status());
        workflow.moveTaskColumn(a.id(), ColumnName.IN_PROGRESS);
        assertEquals(TaskStatus.BLOCKED, workflow.getTask(b.id()).status());
    }

    @Test
    void findsTransitiveRelationsAndCriticalPath() {
        var a = workflow.createTask("A", null, null, 2);
        var b = workflow.createTask("B", null, null, 3);
        var c = workflow.createTask("C", null, null, 5);
        workflow.createDependency(a.id(), b.id(), null);
        workflow.createDependency(b.id(), c.id(), null);
        assertEquals(java.util.List.of(b.id(), a.id()), workflow.getUpstreamTasks(c.id()).stream().map(task -> task.id()).toList());
        assertEquals(java.util.List.of(b.id(), c.id()), workflow.getDownstreamTasks(a.id()).stream().map(task -> task.id()).toList());
        assertEquals(java.util.List.of(a.id(), b.id(), c.id()), workflow.getCriticalPath().path());
        assertEquals(10, workflow.getCriticalPath().totalDuration());
    }

    @Test
    void rejectsInvalidStoredScheduleDateBeforeWriting() {
        var task = workflow.createTask("A", null, "not-a-date", 1);
        assertThrows(IllegalArgumentException.class, () -> workflow.shiftSchedule(task.id(), 1));
        assertEquals("not-a-date", workflow.getTask(task.id()).startDate());
    }
}
