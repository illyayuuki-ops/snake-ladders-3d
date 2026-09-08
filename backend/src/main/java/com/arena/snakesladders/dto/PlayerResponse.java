package com.arena.snakesladders.dto;

import com.arena.snakesladders.model.Player;

import java.time.LocalDateTime;

public class PlayerResponse {

    private Long id;
    private String username;
    private int totalGames;
    private int totalWins;
    private double winRate;
    private Integer fastestWinTurns;
    private LocalDateTime createdAt;

    public static PlayerResponse from(Player p) {
        PlayerResponse r = new PlayerResponse();
        r.id = p.getId();
        r.username = p.getUsername();
        r.totalGames = p.getTotalGames();
        r.totalWins = p.getTotalWins();
        r.winRate = Math.round(p.getWinRate() * 1000.0) / 1000.0;
        r.fastestWinTurns = p.getFastestWinTurns();
        r.createdAt = p.getCreatedAt();
        return r;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public int getTotalGames() {
        return totalGames;
    }

    public void setTotalGames(int totalGames) {
        this.totalGames = totalGames;
    }

    public int getTotalWins() {
        return totalWins;
    }

    public void setTotalWins(int totalWins) {
        this.totalWins = totalWins;
    }

    public double getWinRate() {
        return winRate;
    }

    public void setWinRate(double winRate) {
        this.winRate = winRate;
    }

    public Integer getFastestWinTurns() {
        return fastestWinTurns;
    }

    public void setFastestWinTurns(Integer fastestWinTurns) {
        this.fastestWinTurns = fastestWinTurns;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
