package com.taskflowpro.domain;

import java.util.List;

public record CriticalPath(List<String> path, int totalDuration) { }
