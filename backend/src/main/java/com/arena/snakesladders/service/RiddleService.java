package com.arena.snakesladders.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;

@Service
public class RiddleService {

    @Value("${gemini.api.key:}")
    private String apiKey;

    private final RestTemplate restTemplate = new RestTemplate();
    private final Queue<Riddle> cache = new ConcurrentLinkedQueue<>();
    private static final int CACHE_SIZE = 20;
    private static final String GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

    private final List<Riddle> localPool = Arrays.asList(
            new Riddle("Shiny head on ground\nToss me up and watch me spin\nTail is what you find", "coin", Arrays.asList("coin", "button", "ring", "stamp")),
            new Riddle("Dark within the room\nWax grows thin and wick burns bright\nShadow dances on", "candle", Arrays.asList("candle", "torch", "lantern", "match")),
            new Riddle("Face with hands that move\nTicks away each passing hour\nNo eye can see it", "clock", Arrays.asList("clock", "watch", "calendar", "compass")),
            new Riddle("Shout into the cave\nMy cry returns from far away\nSilent once again", "echo", Arrays.asList("echo", "sound", "voice", "shadow")),
            new Riddle("Sunlight on the wall\nStretch and shrink as dusk arrives\nNo shape of its own", "shadow", Arrays.asList("shadow", "reflection", "silhouette", "ghost")),
            new Riddle("Heavy iron claw\nLets the drifting ship be still\nHolds the boat in place", "anchor", Arrays.asList("anchor", "hook", "chain", "weight")),
            new Riddle("Needle seeks the north\nSpinning till it points the way\nTraveler's true friend", "compass", Arrays.asList("compass", "gyroscope", "map", "magnet")),
            new Riddle("Bridge of colored light\nArc of sun and rain at once\nFades when light departs", "rainbow", Arrays.asList("rainbow", "kite", "prism", "arc")),
            new Riddle("Surface still and clear\nShows the face that looks right back\nTruth in quiet glass", "mirror", Arrays.asList("mirror", "pond", "glass", "window")),
            new Riddle("Tower on the rocks\nBeacon sweeps the darkened sea\nShips find safe harbor", "lighthouse", Arrays.asList("lighthouse", "beacon", "tower", "lamp")),
            new Riddle("Steam begins to rise\nBoiling water waits inside\nTea pours from the spout", "teapot", Arrays.asList("teapot", "kettle", "jar", "flask")),
            new Riddle("Spanning wide and far\nCarries feet across the stream\nArches hold the road", "bridge", Arrays.asList("bridge", "road", "tunnel", "path")),
            new Riddle("Tube peers at the night\nFinds bright dots among dark space\nSecrets in the sky", "telescope", Arrays.asList("telescope", "binoculars", "microscope", "camera")),
            new Riddle("Flame dances, hungry\nOrange tongues lick upward fast\nWarmth from wood and spark", "fire", Arrays.asList("fire", "flame", "torch", "lamp")),
            new Riddle("Storm clouds churn above\nCrack of war within the clouds\nSky drums its loud beat", "thunder", Arrays.asList("thunder", "lightning", "drum", "boom")),
            new Riddle("Metal teeth in door\nTurn me and the lock will yield\nFreedom waits beyond", "key", Arrays.asList("key", "lock", "button", "lever")),
            new Riddle("Drift down from the sky\nOne of many, soft and white\nMelt on tongue at once", "snowflake", Arrays.asList("snowflake", "star", "flake", "crystal")),
            new Riddle("Twigs weave bowl of care\nHidden in the crook of branches\nEggs warm till they hatch", "nest", Arrays.asList("nest", "crib", "web", "hollow")),
            new Riddle("Mountain holds a flame\nPressure builds beneath the crust\nEarth erupts in fire", "volcano", Arrays.asList("volcano", "mountain", "furnace", "fissure")),
            new Riddle("Round a star it spins\nSpins through the void, cold and dark\nRocks and rings may form", "planet", Arrays.asList("planet", "star", "moon", "comet"))
    );

    @PostConstruct
    public void init() {
        if (apiKey != null && !apiKey.trim().isEmpty()) {
            preloadCache();
        }
    }

    public Riddle getRiddle() {
        Riddle cached = cache.poll();
        if (cached != null) {
            return shuffleChoices(cached);
        }
        return getLocalRiddle();
    }

    private void preloadCache() {
        for (int i = 0; i < CACHE_SIZE; i++) {
            try {
                Riddle generated = generateFromGemini();
                if (generated != null) {
                    cache.offer(generated);
                }
            } catch (Exception e) {
                break;
            }
        }
    }

    private Riddle generateFromGemini() {
        if (apiKey == null || apiKey.trim().isEmpty()) {
            return null;
        }

        String prompt = "Generate a single riddle in strict 5-7-5 haiku form: exactly three lines with 5, 7, then 5 syllables. " +
                "Return ONLY a JSON object with exactly these fields: " +
                "question (a single string whose three haiku lines are separated by \\n), " +
                "answer (a single word or short phrase), " +
                "choices (an array of exactly 4 strings, one of which is exactly the answer string). " +
                "The answer must appear verbatim in choices and the riddle must be solvable in the time allowed. " +
                "No extra text, no markdown, no surrounding explanation.";

        Map<String, Object> requestBody = new HashMap<>();
        List<Map<String, Object>> contents = new ArrayList<>();
        Map<String, Object> content = new HashMap<>();
        List<Map<String, String>> parts = new ArrayList<>();
        parts.add(Map.of("text", prompt));
        content.put("parts", parts);
        contents.add(content);
        requestBody.put("contents", contents);

        Map<String, Object> generationConfig = new HashMap<>();
        generationConfig.put("temperature", 0.8);
        generationConfig.put("maxOutputTokens", 200);
        requestBody.put("generationConfig", generationConfig);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
            String url = GEMINI_URL + "?key=" + apiKey;
            Map<String, Object> response = restTemplate.postForObject(url, entity, Map.class);

            if (response != null && response.containsKey("candidates")) {
                List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
                if (!candidates.isEmpty()) {
                    Map<String, Object> candidate = candidates.get(0);
                    Map<String, Object> contentResp = (Map<String, Object>) candidate.get("content");
                    List<Map<String, String>> partsResp = (List<Map<String, String>>) contentResp.get("parts");
                    if (!partsResp.isEmpty()) {
            String jsonText = partsResp.get(0).get("text").trim();
                         jsonText = jsonText.replaceAll("^```json\\s*", "").replaceAll("\\s*```$", "");
                         return parseRiddleJson(jsonText);
                    }
                }
            }
        } catch (Exception e) {
            // Fall back to local pool
        }
        return null;
    }

    private Riddle parseRiddleJson(String json) {
        try {
            Map<String, Object> map = new com.fasterxml.jackson.databind.ObjectMapper().readValue(json, Map.class);
            String question = (String) map.get("question");
            String answer = (String) map.get("answer");
            List<String> choices = (List<String>) map.get("choices");
            if (question == null || answer == null || choices == null || choices.size() != 4) {
                return null;
            }
            String[] lines = question.trim().split("\\n");
            if (lines.length != 3) {
                return null;
            }
            boolean answerPresent = choices.stream().anyMatch(c -> c != null && c.equalsIgnoreCase(answer));
            if (!answerPresent) {
                return null;
            }
            return new Riddle(question, answer, choices);
        } catch (Exception e) {
            // Parse failed -> caller falls back to local pool
        }
        return null;
    }

    private Riddle getLocalRiddle() {
        Riddle r = localPool.get(new Random().nextInt(localPool.size()));
        return shuffleChoices(r);
    }

    private Riddle shuffleChoices(Riddle r) {
        List<String> shuffled = new ArrayList<>(r.getChoices());
        Collections.shuffle(shuffled);
        return new Riddle(r.getQuestion(), r.getAnswer(), shuffled);
    }

    public static class Riddle {
        private String question;
        private String answer;
        private List<String> choices;

        public Riddle() {}

        public Riddle(String question, String answer, List<String> choices) {
            this.question = question;
            this.answer = answer;
            this.choices = choices;
        }

        public String getQuestion() { return question; }
        public void setQuestion(String question) { this.question = question; }
        public String getAnswer() { return answer; }
        public void setAnswer(String answer) { this.answer = answer; }
        public List<String> getChoices() { return choices; }
        public void setChoices(List<String> choices) { this.choices = choices; }
    }
}