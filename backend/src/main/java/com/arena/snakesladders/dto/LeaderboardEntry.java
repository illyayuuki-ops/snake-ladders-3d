package com.arena.snakesladders.dto;

import com.arena.snakesladders.model.Player;

public class LeaderboardEntry {

    private int rank;
    private Long id;
    private String username;
    private int totalGames;
    private int totalWins;
    private double winRate;
    private Integer fastestWinTurns;

    public static LeaderboardEntry from(int rank, Player p) {
        LeaderboardEntry e = new LeaderboardEntry();
        e.rank = rank;
        e.id = p.getId();
        e.username = p.getUsername();
        e.totalGames = p.getTotalGames();
        e.totalWins = p.getTotalWins();
        e.winRate = Math.round(p.getWinRate() * 1000.0) / 1000.0;
        e.fastestWinTurns = p.getFastestWinTurns();
        return e;
    }

    public int getRank() {
        return rank;
    }

    public void setRank(int rank) {
        this.rank = rank;
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
}
