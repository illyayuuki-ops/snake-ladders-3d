package com.arena.snakesladders.repository;

import com.arena.snakesladders.model.GameRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GameRoomRepository extends JpaRepository<GameRoom, String> {

    Optional<GameRoom> findByRoomCode(String roomCode);
}
