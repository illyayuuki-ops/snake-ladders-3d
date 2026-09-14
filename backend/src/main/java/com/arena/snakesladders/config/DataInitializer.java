package com.arena.snakesladders.config;

import com.arena.snakesladders.service.PlayerService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds a few demo profiles on startup so the leaderboard is not
 * empty on first run. Harmless on every boot (profiles are upserted by username).
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private final PlayerService playerService;

    public DataInitializer(PlayerService playerService) {
        this.playerService = playerService;
    }

    @Override
    public void run(String... args) {
        // 112 names to seed the database
        String[] names = {
            "Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi",
            "Ivan", "Judy", "Karl", "Laura", "Mike", "Nina", "Oscar", "Peggy",
            "Quinn", "Ruth", "Steve", "Tina", "Uma", "Victor", "Wendy", "Xavier",
            "Yara", "Zack", "Aaron", "Beth", "Caleb", "Dana", "Ethan", "Fiona",
            "George", "Hannah", "Isaac", "Julia", "Kevin", "Leah", "Mason", "Maya",
            "Nathan", "Olivia", "Peter", "Quinn", "Rachel", "Sam", "Tyler", "Ursula",
            "Vera", "Will", "Xena", "Yvonne", "Zoe", "Adrian", "Bella", "Cody",
            "Diana", "Elliot", "Felix", "Gina", "Henry", "Iris", "Jack", "Kara",
            "Leo", "Luna", "Max", "Nora", "Owen", "Piper", "Quentin", "Ruby",
            "Sage", "Theo", "Uri", "Violet", "Wyatt", "Xander", "Yuna", "Zane",
            "Aria", "Blake", "Chloe", "Dylan", "Emma", "Finn", "Gwen", "Hugo",
            "Ivy", "Jade", "Kai", "Liam", "Mia", "Noah", "Olive", "Pax"
        };

        for (String name : names) {
            playerService.createOrGet(name);
        }
    }
}
