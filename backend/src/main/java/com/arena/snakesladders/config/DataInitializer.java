package com.arena.snakesladders.config;

import com.arena.snakesladders.model.GameHistory;
import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.repository.GameHistoryRepository;
import com.arena.snakesladders.service.PlayerService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Random;
import java.util.Set;

/**
 * Seeds the full imported gamertag roster with randomized, restart-stable stats.
 * Uses a fixed-seed Random so numbers stay identical across H2 file-based restarts.
 * Also seeds backdated game history for specific calendar dates (Sep 8, 10, 11, 14).
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private final PlayerService playerService;
    private final GameHistoryRepository historyRepository;

    public DataInitializer(PlayerService playerService, GameHistoryRepository historyRepository) {
        this.playerService = playerService;
        this.historyRepository = historyRepository;
    }

    @Override
    public void run(String... args) {
        // Backdated seeding for specific calendar dates (Sep 8, 10, 11, 14)
        // Runs first so it establishes baseline for those dates; idempotent via date-range existence check
        seedBackdatedHistory();

        // Full imported roster (~135 gamertags) - duplicates removed
        String[] names = {
            "RedLycoris", "ChisatoVibes", "TakinaAim", "DA_Friends", "LycoRecoFan",
            "SilentAssassin", "ShadowStep", "NightStalker", "PhantomBlade", "GhostWalker",
            "VoidWalker", "AbyssGazer", "DarkSoul", "GrimReaper", "DeathDealer",
            "SoulHarvester", "BloodMoon", "CrimsonBlade", "ScarletWitch", "RubyRose",
            "WeissSchnee", "BlakeBelladonna", "YangXiaoLong", "PennyPolendina", "CinderFall",
            "SalemQueen", "OzpinHead", "IronwoodGen", "WinterSchnee", "QrowBranwen",
            "RavenBranwen", "TaiXiaoLong", "SummerRose", "OzmaKing", "HazelRainart",
            "TyrianCallows", "WattsArthur", "EmeraldSustrai", "MercuryBlack", "Neopolitan",
            "RomanTorchwick", "AdamTaurus", "SiennaKhan", "GhiraBelladonna", "KaliBelladonna",
            "SunWukong", "NeptuneVasilias", "CardinWinchester", "RusselThrush", "SkyLark",
            "DoveBronzewing", "FlyntCoal", "NeonKatt", "TeamRWBY", "TeamJNPR",
            "TeamSNN", "TeamCFVY", "TeamABRN", "TeamFNKI", "TeamBRNZ",
            "TeamNDGO", "TeamOCT", "TeamCMEN", "TeamSTRQ", "TeamOZMA",
            "AceOps", "HappyHuntsmen", "MaroonSahara", "JoachimA", "ElmEderne",
            "VineZeki", "HarrietBree", "CloverEbi", "FionaThreep", "RobynHill",
            "JoannaGreenleaf", "MayMarigold",
            "HitmarkerKing", "OneTapGod", "HeadshotHero", "FlickShotPro", "AimBotCalibrated",
            "TrackingMaster", "SprayControl", "RecoilPattern", "CrosshairPlacement", "PreAimKing",
            "AngleHolder", "PeekMaster", "EntryFragger", "ClutchGod", "AceHunter",
            "NinjaDefuse", "FakeDefuse", "BombPlant", "SiteAnchor", "RotatorPro",
            "LurkMaster", "FlankKing", "InfoGatherer", "UtilityUsage", "FlashMaster",
            "SmokeExpert", "MollyQueen", "HEGrenade", "DecoyGrenade", "FlashbangPro",
            "WallbangKing", "PenetrationPro", "SpamMaster", "PrefireKing", "HoldAngle",
            "WideSwing", "JigglePeek", "ShoulderPeek", "JumpPeek", "CrouchPeek",
            "RunBoost", "JumpBoost", "CrouchJump", "LongJump", "BhopMaster",
            "SurfPro", "KzClimber", "SlideHop", "StrafeJump", "AirStrafe",
            "MovementGod", "SpeedRunner", "TrickJumper", "ParkourPro", "ClimbMaster",
            "LethalStalker"
        };

        // Only seed main roster if the roster players don't exist yet (backdated seeding may have created demo players)
        if (!playerService.exists("RedLycoris")) {
            Random rand = new Random(42); // Fixed seed for restart-stable stats
            Set<String> seen = new HashSet<>(); // Defensive deduplication

            for (String name : names) {
                // Defensive: skip if already processed (case-insensitive)
                if (!seen.add(name.toLowerCase())) {
                    continue;
                }
                Player p = playerService.createOrGet(name);

                // Generate randomized stats
                int wins = rand.nextInt(26); // 0..25
                int losses = rand.nextInt(26); // 0..25
                // Ensure most have at least 1 game
                if (wins + losses == 0) {
                    wins = 1;
                }
                int fastestBase = 25 + rand.nextInt(46); // 25..70

                // Spread match dates over the past 90 days for calendar demo
                // Use fixed seed so distribution is restart-stable
                LocalDateTime now = LocalDateTime.now();

                // Record wins (LOCAL, CLASSIC)
                for (int w = 0; w < wins; w++) {
                    int turns = fastestBase + w * rand.nextInt(5); // fastestBase + w*rand(0..4)
                    int daysAgo = rand.nextInt(90); // 0..89 days ago
                    int hour = 8 + rand.nextInt(14); // 8..21
                    int minute = rand.nextInt(60);
                    LocalDateTime playedAt = now.minusDays(daysAgo).withHour(hour).withMinute(minute).withSecond(0).withNano(0);
                    playerService.recordMatchWithTimestamp(p.getUsername(), "LOCAL", "CLASSIC", true, turns, 1, playedAt);
                }

                // Record losses (VS_AI, POWERUP)
                for (int l = 0; l < losses; l++) {
                    int turns = 55 + rand.nextInt(46); // 55..100
                    int daysAgo = rand.nextInt(90); // 0..89 days ago
                    int hour = 8 + rand.nextInt(14); // 8..21
                    int minute = rand.nextInt(60);
                    LocalDateTime playedAt = now.minusDays(daysAgo).withHour(hour).withMinute(minute).withSecond(0).withNano(0);
                    playerService.recordMatchWithTimestamp(p.getUsername(), "VS_AI", "POWERUP", false, turns, 2, playedAt);
                    }
                }
            }
        }

    /**
     * Seeds a random number of game history records for September 8, 10, 11, and 14
     * of the current year. Idempotent: skips dates that already have history records.
     */
    private void seedBackdatedHistory() {
        int year = LocalDate.now().getYear();
        int[] targetDays = {8, 10, 11, 14};
        String[] demoPlayers = {"Alice", "Bob", "Carol", "Dave", "Eve"};
        String[] modes = {"LOCAL", "VS_AI", "ONLINE"};
        String[] variants = {"CLASSIC", "POWERUP", "TIME_ATTACK"};

        Random rand = new Random(); // True randomness for varied counts per date

        for (int day : targetDays) {
            LocalDate targetDate = LocalDate.of(year, 9, day);
            LocalDateTime startOfDay = targetDate.atStartOfDay();
            LocalDateTime endOfDay = targetDate.atTime(23, 59, 59, 999_999_999);

            // Check if history already exists for this date
            long existingCount = historyRepository.findByPlayedAtBetweenOrderByPlayedAtDesc(startOfDay, endOfDay).size();
            if (existingCount > 0) {
                continue; // Already seeded for this date
            }

            // Random number of games for this date: 1 to 10
            int gameCount = 1 + rand.nextInt(10);

            for (int i = 0; i < gameCount; i++) {
                String username = demoPlayers[rand.nextInt(demoPlayers.length)];
                String mode = modes[rand.nextInt(modes.length)];
                String variant = variants[rand.nextInt(variants.length)];
                boolean won = rand.nextBoolean();
                int turns = 10 + rand.nextInt(91); // 10..100
                int placement = won ? 1 : (2 + rand.nextInt(3)); // 1 if won, 2-4 if lost

                // Varied time during the day (8:00 to 22:00)
                int hour = 8 + rand.nextInt(15);
                int minute = rand.nextInt(60);
                LocalDateTime playedAt = targetDate.atTime(hour, minute);

                playerService.recordMatchWithTimestamp(username, mode, variant, won, turns, placement, playedAt);
            }
        }
    }
}