package com.taskflowpro.web;

import com.taskflowpro.ai.AiModels;
import com.taskflowpro.ai.AiService;
import com.taskflowpro.service.NotFoundException;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private final AiService aiService;

    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @PostMapping("/tasks/{id}/suggest-dependencies")
    public ResponseEntity<AiModels.SuggestionOutcome> suggestDependencies(@PathVariable String id) {
        try {
            return ResponseEntity.ok(aiService.suggestDependencies(id));
        } catch (NotFoundException exception) {
            throw exception;
        } catch (Exception exception) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new AiModels.SuggestionOutcome(
                    false, List.of(), "AI suggestion unavailable: " + message(exception)));
        }
    }

    @PostMapping("/investigate")
    public ResponseEntity<AiModels.InvestigatorOutcome> investigate(@Valid @RequestBody InvestigateRequest request) {
        try {
            return ResponseEntity.ok(aiService.investigateImpact(request.question()));
        } catch (Exception exception) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new AiModels.InvestigatorOutcome(
                    "Investigation unavailable: " + message(exception), List.of()));
        }
    }

    @GetMapping("/drift-report")
    public ResponseEntity<AiModels.DriftOutcome> driftReport() {
        try {
            return ResponseEntity.ok(aiService.detectDrift());
        } catch (Exception exception) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new AiModels.DriftOutcome(
                    false, List.of(), "Drift report unavailable: " + message(exception)));
        }
    }

    private String message(Exception exception) {
        return exception.getMessage() == null ? "unknown error" : exception.getMessage();
    }
}
