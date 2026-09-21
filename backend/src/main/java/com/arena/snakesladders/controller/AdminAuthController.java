package com.arena.snakesladders.controller;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * Simple admin authentication controller using HTTP sessions.
 * No Spring Security - lightweight password check against configured value.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminAuthController {

    private final String expectedPassword;

    public AdminAuthController(@Value("${admin.password:admin123}") String password) {
        this.expectedPassword = password;
    }

    /**
     * Login endpoint - checks password and sets session attribute on success.
     *
     * @param request login request with password field
     * @param session HTTP session
     * @return success/failure response
     */
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody LoginRequest request, HttpSession session) {
        Map<String, Object> response = new HashMap<>();

        if (request != null && request.password != null && request.password.equals(expectedPassword)) {
            session.setAttribute("adminAuthed", true);
            response.put("success", true);
            response.put("message", "Login successful");
            return ResponseEntity.ok(response);
        } else {
            response.put("success", false);
            response.put("message", "Invalid password");
            return ResponseEntity.status(401).body(response);
        }
    }

    /**
     * Logout endpoint - clears the admin session.
     *
     * @param session HTTP session
     * @return success response
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(HttpSession session) {
        session.invalidate();
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "Logged out");
        return ResponseEntity.ok(response);
    }

    /**
     * Check current auth status.
     *
     * @param session HTTP session
     * @return auth status
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(HttpSession session) {
        Map<String, Object> response = new HashMap<>();
        Boolean authed = (Boolean) session.getAttribute("adminAuthed");
        response.put("authenticated", Boolean.TRUE.equals(authed));
        return ResponseEntity.ok(response);
    }

    /**
     * Request DTO for login.
     */
    public static class LoginRequest {
        public String password;

        public LoginRequest() {}

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }
}