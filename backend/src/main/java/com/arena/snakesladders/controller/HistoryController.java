package com.arena.snakesladders.controller;

import com.arena.snakesladders.model.GameHistory;
import com.arena.snakesladders.repository.GameHistoryRepository;
import com.arena.snakesladders.service.ReportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * REST controller for game history queries and PDF export.
 * Mapped to /api/history
 */
@RestController
@RequestMapping("/api/history")
public class HistoryController {

    private final GameHistoryRepository historyRepository;
    private final ReportService reportService;

    public HistoryController(GameHistoryRepository historyRepository, ReportService reportService) {
        this.historyRepository = historyRepository;
        this.reportService = reportService;
    }

    /**
     * Get game history for a specific date or date range.
     *
     * @param date single date in YYYY-MM-DD format (optional if from/to provided)
     * @param from start date in YYYY-MM-DD format (inclusive)
     * @param to end date in YYYY-MM-DD format (inclusive)
     * @return list of game history records
     */
    @GetMapping
    public List<HistoryRecord> getHistory(
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        LocalDateTime start;
        LocalDateTime end;

        if (date != null && !date.isEmpty()) {
            // Single date: start of day to end of day
            LocalDate ld = LocalDate.parse(date);
            start = ld.atStartOfDay();
            end = ld.atTime(23, 59, 59, 999_999_999);
        } else if (from != null && !from.isEmpty() && to != null && !to.isEmpty()) {
            // Date range
            start = LocalDate.parse(from).atStartOfDay();
            end = LocalDate.parse(to).atTime(23, 59, 59, 999_999_999);
        } else {
            // Default to today
            LocalDate today = LocalDate.now();
            start = today.atStartOfDay();
            end = today.atTime(23, 59, 59, 999_999_999);
        }

        List<GameHistory> records = historyRepository.findByPlayedAtBetweenOrderByPlayedAtDesc(start, end);
        return records.stream().map(HistoryRecord::from).collect(Collectors.toList());
    }

    /**
     * Export game history as PDF for a specific date or date range.
     *
     * @param date single date in YYYY-MM-DD format (optional if from/to provided)
     * @param from start date in YYYY-MM-DD format (inclusive)
     * @param to end date in YYYY-MM-DD format (inclusive)
     * @return PDF file as byte stream
     */
    @GetMapping(value = "/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> exportPdf(
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        LocalDateTime start;
        LocalDateTime end;
        LocalDateTime reportDate; // for title/filename

        if (date != null && !date.isEmpty()) {
            LocalDate ld = LocalDate.parse(date);
            start = ld.atStartOfDay();
            end = ld.atTime(23, 59, 59, 999_999_999);
            reportDate = ld.atStartOfDay();
        } else if (from != null && !from.isEmpty() && to != null && !to.isEmpty()) {
            start = LocalDate.parse(from).atStartOfDay();
            end = LocalDate.parse(to).atTime(23, 59, 59, 999_999_999);
            reportDate = LocalDate.parse(from).atStartOfDay();
        } else {
            LocalDate today = LocalDate.now();
            start = today.atStartOfDay();
            end = today.atTime(23, 59, 59, 999_999_999);
            reportDate = today.atStartOfDay();
        }

        List<GameHistory> records = historyRepository.findByPlayedAtBetweenOrderByPlayedAtDesc(start, end);
        byte[] pdfBytes = reportService.generatePlayRecordsPdf(records, reportDate);

        String filename = "play-records-" + reportDate.format(DateTimeFormatter.ofPattern("yyyyMMdd")) + ".pdf";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData("attachment", filename);
        headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");

        return ResponseEntity.ok()
                .headers(headers)
                .body(pdfBytes);
    }

    /**
     * DTO for history records returned to the frontend.
     */
    public static class HistoryRecord {
        public final String username;
        public final boolean won;
        public final String mode;
        public final String variant;
        public final int turns;
        public final int placement;
        public final String playedAt; // ISO format

        private HistoryRecord(String username, boolean won, String mode, String variant, int turns, int placement, String playedAt) {
            this.username = username;
            this.won = won;
            this.mode = mode;
            this.variant = variant;
            this.turns = turns;
            this.placement = placement;
            this.playedAt = playedAt;
        }

        public static HistoryRecord from(GameHistory gh) {
            String playedAtStr = gh.getPlayedAt() != null ? gh.getPlayedAt().toString() : "";
            return new HistoryRecord(gh.getUsername(), gh.isWon(), gh.getMode(), gh.getVariant(),
                    gh.getTurns(), gh.getPlacement(), playedAtStr);
        }
    }
}