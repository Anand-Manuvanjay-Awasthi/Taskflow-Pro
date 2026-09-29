package com.taskflowpro.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Minimal server-side Anthropic Messages API client; API keys never reach the browser. */
@Component
public class AnthropicLlmClient implements LlmClient {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String apiKey;
    private final String model;

    public AnthropicLlmClient(
            ObjectMapper objectMapper,
            @Value("${ANTHROPIC_API_KEY:}") String apiKey,
            @Value("${ANTHROPIC_MODEL:claude-sonnet-4-6}") String model) {
        this.objectMapper = objectMapper;
        this.apiKey = apiKey;
        this.model = model;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    }

    @Override
    public LlmResponse create(LlmRequest request) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new AiUnavailableException("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add a key.");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", model);
        payload.put("max_tokens", request.tools().isEmpty() ? 1_500 : 1_500);
        if (request.system() != null && !request.system().isBlank()) payload.put("system", request.system());
        if (!request.tools().isEmpty()) payload.put("tools", request.tools());
        payload.put("messages", request.messages().stream()
                .map(message -> Map.<String, Object>of("role", message.role(), "content", message.content()))
                .toList());
        try {
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create("https://api.anthropic.com/v1/messages"))
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .timeout(Duration.ofSeconds(45))
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                    .build();
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new AiUnavailableException("Anthropic API returned HTTP " + response.statusCode());
            }
            JsonNode body = objectMapper.readTree(response.body());
            List<Map<String, Object>> content = objectMapper.convertValue(body.path("content"), new TypeReference<>() { });
            return new LlmResponse(content == null ? new ArrayList<>() : content, body.path("stop_reason").asText(""));
        } catch (IOException exception) {
            throw new AiUnavailableException("could not parse the Anthropic response", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiUnavailableException("Anthropic request was interrupted", exception);
        } catch (AiUnavailableException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new AiUnavailableException("could not reach the Anthropic API", exception);
        }
    }
}
