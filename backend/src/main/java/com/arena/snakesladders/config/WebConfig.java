package com.arena.snakesladders.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

/**
 * CORS configuration for API and WebSocket endpoints.
 * Allowed origins can be configured via the 'app.cors.allowed-origins' property
 * (comma-separated). Defaults to same-origin only for security.
 * Credentials are allowed only for explicitly configured origins.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins:}")
    private String allowedOriginsConfig;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] allowedOrigins = parseAllowedOrigins(allowedOriginsConfig);

        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);

        registry.addMapping("/ws/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("*")
                .allowedHeaders("*")
                .allowCredentials(true);
    }

    private String[] parseAllowedOrigins(String config) {
        if (config == null || config.trim().isEmpty()) {
            // Default to same-origin only (empty array means no cross-origin requests allowed)
            return new String[0];
        }
        return Arrays.stream(config.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
    }
}
