package com.zhiqu.server.assistant;

import com.zhiqu.server.assistant.AiAssistantDtos.ConfigResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.ConversationCreatedResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.ConversationView;
import com.zhiqu.server.assistant.AiAssistantDtos.CreateConversationRequest;
import com.zhiqu.server.assistant.AiAssistantDtos.FeedbackRequest;
import com.zhiqu.server.assistant.AiAssistantDtos.FeedbackResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.MessageExchangeResponse;
import com.zhiqu.server.assistant.AiAssistantDtos.MessageView;
import com.zhiqu.server.assistant.AiAssistantDtos.RecommendationView;
import com.zhiqu.server.assistant.AiAssistantDtos.SendMessageRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/assistant")
public class AiAssistantController {
    private final AiAssistantService service;

    public AiAssistantController(AiAssistantService service) {
        this.service = service;
    }

    @GetMapping("/config")
    ConfigResponse config(Authentication authentication) {
        return service.config(authentication.getName());
    }

    @GetMapping("/conversations")
    List<ConversationView> conversations(Authentication authentication) {
        return service.listConversations(authentication.getName());
    }

    @PostMapping("/conversations")
    ResponseEntity<ConversationCreatedResponse> createConversation(
            @RequestBody(required = false) CreateConversationRequest request,
            Authentication authentication
    ) {
        boolean memoryEnabled = request != null && request.memoryEnabledOrDefault();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.createConversation(authentication.getName(), memoryEnabled));
    }

    @GetMapping("/conversations/{conversationId}/messages")
    List<MessageView> messages(
            @PathVariable String conversationId,
            Authentication authentication
    ) {
        return service.listMessages(authentication.getName(), conversationId);
    }

    @DeleteMapping("/conversations/{conversationId}/messages/{messageId}")
    ResponseEntity<Void> deleteMessage(
            @PathVariable String conversationId,
            @PathVariable String messageId,
            Authentication authentication
    ) {
        service.deleteMessage(authentication.getName(), conversationId, messageId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/conversations/{conversationId}/messages")
    MessageExchangeResponse sendMessage(
            @PathVariable String conversationId,
            @Valid @RequestBody SendMessageRequest request,
            Authentication authentication
    ) {
        return service.sendMessage(authentication.getName(), conversationId, request);
    }

    @GetMapping("/recommendations")
    List<RecommendationView> recommendations(Authentication authentication) {
        return service.recommendations(authentication.getName());
    }

    @PostMapping("/feedback")
    FeedbackResponse feedback(
            @Valid @RequestBody FeedbackRequest request,
            Authentication authentication
    ) {
        return service.feedback(authentication.getName(), request);
    }

    @DeleteMapping("/conversations/{conversationId}")
    ResponseEntity<Void> deleteConversation(
            @PathVariable String conversationId,
            Authentication authentication
    ) {
        service.deleteConversation(authentication.getName(), conversationId);
        return ResponseEntity.noContent().build();
    }
}
