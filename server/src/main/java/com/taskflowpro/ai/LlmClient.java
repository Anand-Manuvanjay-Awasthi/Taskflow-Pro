package com.taskflowpro.ai;

import java.util.List;
import java.util.Map;

public interface LlmClient {
    LlmResponse create(LlmRequest request);

    record LlmRequest(String system, List<LlmMessage> messages, List<Map<String, Object>> tools) { }
    record LlmMessage(String role, Object content) { }
    record LlmResponse(List<Map<String, Object>> content, String stopReason) { }
}
