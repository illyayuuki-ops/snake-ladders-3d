package com.arena.snakesladders.config;

import com.arena.snakesladders.model.Player;
import com.arena.snakesladders.service.PlayerService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Random;
import java.util.Set;

/**
 * Seeds the full imported gamertag roster with randomized, restart-stable stats.
 * Uses a fixed-seed Random so numbers stay identical across H2 in-memory restarts.
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private final PlayerService playerService;

    public DataInitializer(PlayerService playerService) {
        this.playerService = playerService;
    }

    @Override
    public void run(String... args) {
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

        // Only seed if database is empty
        if (playerService.findAll().isEmpty()) {
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

                // Record wins (LOCAL, CLASSIC)
                for (int w = 0; w < wins; w++) {
                    int turns = fastestBase + w * rand.nextInt(5); // fastestBase + w*rand(0..4)
                    playerService.recordMatch(p.getUsername(), "LOCAL", "CLASSIC", true, turns, 1);
                }

                // Record losses (VS_AI, POWERUP)
                for (int l = 0; l < losses; l++) {
                    int turns = 55 + rand.nextInt(46); // 55..100
                    playerService.recordMatch(p.getUsername(), "VS_AI", "POWERUP", false, turns, 2);
                }
            }
        }
    }
}