package com.arena.snakesladders.controller;

import com.arena.snakesladders.service.RiddleService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RiddleController {

    private final RiddleService riddleService;

    public RiddleController(RiddleService riddleService) {
        this.riddleService = riddleService;
    }

    @GetMapping("/riddle")
    public ResponseEntity<RiddleService.Riddle> getRiddle() {
        RiddleService.Riddle riddle = riddleService.getRiddle();
        return ResponseEntity.ok(riddle);
    }
}