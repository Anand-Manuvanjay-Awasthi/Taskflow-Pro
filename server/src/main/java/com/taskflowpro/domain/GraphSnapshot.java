package com.taskflowpro.domain;

import java.util.List;
import java.util.Map;

public record GraphSnapshot(
        Map<String, Task> tasks,
        Map<String, List<String>> edgesFrom,
        Map<String, List<String>> edgesTo
) { }
