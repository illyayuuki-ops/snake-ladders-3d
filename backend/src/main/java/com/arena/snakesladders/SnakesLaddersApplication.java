package com.arena.snakesladders;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class SnakesLaddersApplication {
    public static void main(String[] args) {
        SpringApplication.run(SnakesLaddersApplication.class, args);
    }
}
