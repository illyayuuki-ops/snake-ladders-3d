package com.arena.snakesladders.service;

import com.arena.snakesladders.model.GameHistory;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Service for generating PDF reports of game history.
 */
@Service
public class ReportService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final DateTimeFormatter FILE_DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    // Color constants (using java.awt.Color, compatible with FontFactory)
    private static final Color DARK_GRAY = new Color(0x14, 0x1c, 0x36);
    private static final Color WHITE = Color.WHITE;
    private static final Color BLACK = Color.BLACK;
    private static final Color GRAY = Color.GRAY;
    private static final Color LIGHT_GRAY = Color.LIGHT_GRAY;
    private static final Color GREEN = new Color(0x34, 0xd3, 0x99);
    private static final Color RED = new Color(0xf8, 0x71, 0x71);
    private static final Color ALT_ROW_BG = new Color(0xf0, 0xf4, 0xff);

    /**
     * Generates a PDF report for the given game history records.
     *
     * @param records list of GameHistory entries to include in the report
     * @param date the date for the report (used in title and filename)
     * @return byte array containing the PDF document
     */
    public byte[] generatePlayRecordsPdf(List<GameHistory> records, LocalDateTime date) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4.rotate(), 36, 36, 36, 36);
            PdfWriter.getInstance(document, baos);
            document.open();

            // Title
            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18, DARK_GRAY);
            String titleDate = date != null ? date.format(DATE_FMT) : "All Dates";
            Paragraph title = new Paragraph("Play Records Report — " + titleDate, titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(16f);
            document.add(title);

            // Subtitle with generation timestamp
            Font metaFont = FontFactory.getFont(FontFactory.HELVETICA, 10, GRAY);
            Paragraph meta = new Paragraph("Generated: " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), metaFont);
            meta.setAlignment(Element.ALIGN_CENTER);
            meta.setSpacingAfter(20f);
            document.add(meta);

            // Table with 7 columns: Player, Result, Mode, Variant, Turns, Placement, Time
            PdfPTable table = new PdfPTable(7);
            table.setWidthPercentage(100);
            table.setWidths(new float[]{2.5f, 1.2f, 1.2f, 1.2f, 1f, 1.2f, 1.8f});
            table.setSpacingBefore(10f);
            table.setSpacingAfter(10f);

            Font headerFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, WHITE);
            Font cellFont = FontFactory.getFont(FontFactory.HELVETICA, 9, BLACK);
            Font winFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, GREEN);
            Font lossFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, RED);

            String[] headers = {"Player", "Result", "Mode", "Variant", "Turns", "Placement", "Time"};
            for (String h : headers) {
                PdfPCell cell = new PdfPCell(new Phrase(h, headerFont));
                cell.setBackgroundColor(DARK_GRAY);
                cell.setHorizontalAlignment(Element.ALIGN_CENTER);
                cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
                cell.setPadding(8f);
                cell.setBorderColor(LIGHT_GRAY);
                table.addCell(cell);
            }

            if (records.isEmpty()) {
                PdfPCell emptyCell = new PdfPCell(new Phrase("No records found for this date.", cellFont));
                emptyCell.setColspan(7);
                emptyCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                emptyCell.setPadding(20f);
                emptyCell.setBorderColor(LIGHT_GRAY);
                table.addCell(emptyCell);
            } else {
                for (int i = 0; i < records.size(); i++) {
                    GameHistory gh = records.get(i);
                    Color rowBg = (i % 2 == 0) ? WHITE : ALT_ROW_BG;

                    // Player
                    PdfPCell playerCell = new PdfPCell(new Phrase(gh.getUsername(), cellFont));
                    playerCell.setBackgroundColor(rowBg);
                    playerCell.setPadding(6f);
                    playerCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(playerCell);

                    // Result (Win/Loss) with color
                    String result = gh.isWon() ? "Win" : "Loss";
                    Font resultFont = gh.isWon() ? winFont : lossFont;
                    PdfPCell resultCell = new PdfPCell(new Phrase(result, resultFont));
                    resultCell.setBackgroundColor(rowBg);
                    resultCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    resultCell.setPadding(6f);
                    resultCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(resultCell);

                    // Mode
                    PdfPCell modeCell = new PdfPCell(new Phrase(gh.getMode(), cellFont));
                    modeCell.setBackgroundColor(rowBg);
                    modeCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    modeCell.setPadding(6f);
                    modeCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(modeCell);

                    // Variant
                    PdfPCell variantCell = new PdfPCell(new Phrase(gh.getVariant(), cellFont));
                    variantCell.setBackgroundColor(rowBg);
                    variantCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    variantCell.setPadding(6f);
                    variantCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(variantCell);

                    // Turns
                    PdfPCell turnsCell = new PdfPCell(new Phrase(String.valueOf(gh.getTurns()), cellFont));
                    turnsCell.setBackgroundColor(rowBg);
                    turnsCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    turnsCell.setPadding(6f);
                    turnsCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(turnsCell);

                    // Placement
                    PdfPCell placementCell = new PdfPCell(new Phrase(String.valueOf(gh.getPlacement()), cellFont));
                    placementCell.setBackgroundColor(rowBg);
                    placementCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    placementCell.setPadding(6f);
                    placementCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(placementCell);

                    // Time
                    String timeStr = gh.getPlayedAt() != null ? gh.getPlayedAt().format(TIME_FMT) : "—";
                    PdfPCell timeCell = new PdfPCell(new Phrase(timeStr, cellFont));
                    timeCell.setBackgroundColor(rowBg);
                    timeCell.setHorizontalAlignment(Element.ALIGN_CENTER);
                    timeCell.setPadding(6f);
                    timeCell.setBorderColor(LIGHT_GRAY);
                    table.addCell(timeCell);
                }
            }

            document.add(table);

            // Footer with record count
            Font footerFont = FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 9, GRAY);
            Paragraph footer = new Paragraph("Total records: " + records.size(), footerFont);
            footer.setAlignment(Element.ALIGN_RIGHT);
            footer.setSpacingBefore(12f);
            document.add(footer);

            document.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate PDF report", e);
        }
    }
}