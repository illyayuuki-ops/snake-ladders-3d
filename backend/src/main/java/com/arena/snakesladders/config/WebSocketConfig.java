package com.arena.snakesladders.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * STOMP / WebSocket configuration.
 * Clients connect to /ws (SockJS fallback) and subscribe to /topic/**.
 * Messages are routed through the application destination prefix /app.
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // SockJS endpoint so browsers without native WebSocket can still connect.
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // Enables a simple in-memory broker for broadcasts.
        registry.enableSimpleBroker("/topic", "/queue");
        // Prefix for messages bound for @MessageMapping controller methods.
        registry.setApplicationDestinationPrefixes("/app");
        // Prefix used when a user-specific destination is required.
        registry.setUserDestinationPrefix("/user");
    }
}
