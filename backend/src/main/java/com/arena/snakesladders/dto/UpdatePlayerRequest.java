package com.arena.snakesladders.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

public class UpdatePlayerRequest {

    @NotBlank
    @Size(min = 2, max = 40)
    private String username;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }
}
