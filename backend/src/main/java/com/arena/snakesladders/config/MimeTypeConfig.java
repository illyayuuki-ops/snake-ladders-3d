package com.arena.snakesladders.config;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Serves manifest.webmanifest with the correct MIME type (application/manifest+json).
 * Spring Boot's default static-resource handler serves .webmanifest as
 * application/octet-stream, so we override with an explicit controller.
 * This is additive — no existing endpoints are affected.
 */
@Controller
public class MimeTypeConfig {

    private static final MediaType MANIFEST_JSON = MediaType.valueOf("application/manifest+json");

    @GetMapping(value = "/manifest.webmanifest", produces = "application/manifest+json")
    public ResponseEntity<Resource> serveManifest() {
        Resource resource = new ClassPathResource("static/manifest.webmanifest");
        if (!resource.exists()) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MANIFEST_JSON)
                .body(resource);
    }
}
