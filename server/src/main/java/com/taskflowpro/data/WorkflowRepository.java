package com.taskflowpro.data;

import com.taskflowpro.domain.ColumnName;
import com.taskflowpro.domain.Dependency;
import com.taskflowpro.domain.DependencySource;
import com.taskflowpro.domain.Task;
import com.taskflowpro.domain.TaskStatus;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class WorkflowRepository {
    private final JdbcTemplate jdbc;

    private final RowMapper<Task> taskMapper = (rs, rowNum) -> new Task(
            rs.getString("id"),
            rs.getString("title"),
            rs.getString("description"),
            ColumnName.fromValue(rs.getString("column_name")),
            TaskStatus.fromValue(rs.getString("status")),
            rs.getString("start_date"),
            rs.getInt("duration"),
            rs.getString("created_at"),
            rs.getString("updated_at"));

    private final RowMapper<Dependency> dependencyMapper = (rs, rowNum) -> new Dependency(
            rs.getString("id"),
            rs.getString("from_task_id"),
            rs.getString("to_task_id"),
            rs.getString("created_at"),
            DependencySource.fromValue(rs.getString("source")));

    public WorkflowRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Task> listTasks() {
        return jdbc.query("SELECT * FROM tasks ORDER BY created_at ASC", taskMapper);
    }

    public Optional<Task> findTask(String id) {
        try {
            return Optional.ofNullable(jdbc.queryForObject("SELECT * FROM tasks WHERE id = ?", taskMapper, id));
        } catch (EmptyResultDataAccessException ignored) {
            return Optional.empty();
        }
    }

    public List<Dependency> listDependencies() {
        return jdbc.query("SELECT * FROM dependencies ORDER BY created_at ASC", dependencyMapper);
    }

    public Task createTask(String title, String description, String startDate, int duration) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        jdbc.update("""
                INSERT INTO tasks (id, title, description, column_name, status, start_date, duration, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, title, description, ColumnName.BACKLOG.value(), TaskStatus.READY.value(), startDate, duration, now, now);
        return findTask(id).orElseThrow();
    }

    public void updateTaskColumn(String id, ColumnName column) {
        jdbc.update("UPDATE tasks SET column_name = ?, updated_at = ? WHERE id = ?", column.value(), Instant.now().toString(), id);
    }

    public void updateTaskStatus(String id, TaskStatus status) {
        jdbc.update("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?", status.value(), Instant.now().toString(), id);
    }

    public void updateTaskSchedule(String id, String startDate) {
        jdbc.update("UPDATE tasks SET start_date = ?, updated_at = ? WHERE id = ?", startDate, Instant.now().toString(), id);
    }

    public void logStateChange(String taskId, TaskStatus fromStatus, TaskStatus toStatus) {
        jdbc.update("""
                INSERT INTO task_state_log (id, task_id, from_status, to_status, changed_at)
                VALUES (?, ?, ?, ?, ?)
                """, UUID.randomUUID().toString(), taskId,
                fromStatus == null ? null : fromStatus.value(), toStatus.value(), Instant.now().toString());
    }

    public Dependency createDependency(String fromTaskId, String toTaskId, DependencySource source) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();
        jdbc.update("""
                INSERT INTO dependencies (id, from_task_id, to_task_id, created_at, source)
                VALUES (?, ?, ?, ?, ?)
                """, id, fromTaskId, toTaskId, now, source.value());
        return new Dependency(id, fromTaskId, toTaskId, now, source);
    }

    public boolean dependencyExists(String fromTaskId, String toTaskId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dependencies WHERE from_task_id = ? AND to_task_id = ?",
                Integer.class, fromTaskId, toTaskId);
        return count != null && count > 0;
    }
}
