package com.taskflowpro.web;

import jakarta.validation.constraints.NotBlank;

public record InvestigateRequest(@NotBlank(message = "question is required") String question) { }
