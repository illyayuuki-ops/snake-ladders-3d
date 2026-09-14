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
            new Riddle("Black keys, white keys sing\nNo lock opens to their tune\nMusic flows within", "A piano", Arrays.asList("A piano", "A map", "A computer", "A door")),
            new Riddle("Round head, tail behind\nNo body in the middle\nSpends but has no life", "A coin", Arrays.asList("A coin", "A snake", "A comet", "A worm")),
            new Riddle("Wet more as it dries\nHangs upon the bathroom rack\nSoft thirst drinks the bath", "A towel", Arrays.asList("A towel", "A sponge", "A cloth", "A mop")),
            new Riddle("Catch it, cannot throw\nWinter brings it uninvited\nRest cures the sneeze fast", "A cold", Arrays.asList("A cold", "A ball", "A fish", "A frisbee")),
            new Riddle("Many teeth in row\nCannot bite a single thing\nStraightens tangled hair", "A comb", Arrays.asList("A comb", "A saw", "A zipper", "A gear")),
            new Riddle("Four legs standing tall\nCannot walk a single step\nHolds your dinner plate", "A table", Arrays.asList("A table", "A chair", "A stool", "A bed")),
            new Riddle("One eye sees no light\nThread passes through the small hole\nMends the torn apart", "A needle", Arrays.asList("A needle", "A storm", "A potato", "A camera")),
            new Riddle("Numbers climb each year\nNever once goes back again\nBirthdays mark the rise", "Your age", Arrays.asList("Your age", "A balloon", "Smoke", "A rocket")),
            new Riddle("Pages hold the words\nSilent stories wait inside\nOpen, read, travel", "A book", Arrays.asList("A book", "A dictionary", "A letter", "A sign")),
            new Riddle("Long neck, no head found\nCork guards the liquid within\nPour and share the drink", "A bottle", Arrays.asList("A bottle", "A shirt", "A guitar", "A vase")),
            new Riddle("Corner holds the world\nSticky back carries the mail\nTravels far and wide", "A stamp", Arrays.asList("A stamp", "A coin", "A postcard", "A letter")),
            new Riddle("Thumb and fingers four\nNot alive but fits the hand\nWarms against the cold", "A glove", Arrays.asList("A glove", "A hand", "A mitten", "A puppet")),
            new Riddle("Full of holes yet holds\nWater soaks in every pore\nSqueeze and it lets go", "A sponge", Arrays.asList("A sponge", "A net", "A colander", "A bucket")),
            new Riddle("Break without a touch\nWords once spoken bind the heart\nTrust once lost is gone", "A promise", Arrays.asList("A promise", "A heart", "A record", "A rule")),
            new Riddle("Goes up, goes down, stays\nSteps connect each floor to floor\nFeet move, stairs stand firm", "A staircase", Arrays.asList("A staircase", "An elevator", "A ladder", "A hill")),
            new Riddle("Has a ring, no hand\nVoice travels through the wire\nHello, who is this?", "A phone", Arrays.asList("A phone", "A bell", "A planet", "A circle")),
            new Riddle("Branches, no leaves grow\nMoney kept in vaulted rooms\nInterest blooms in time", "A bank", Arrays.asList("A bank", "A tree", "A river", "A family")),
            new Riddle("Fills the room with light\nTakes no space, no weight at all\nDarkness flees away", "Light", Arrays.asList("Light", "Air", "Sound", "Shadow")),
            new Riddle("Always just ahead\nNever caught by reaching hand\nTomorrow becomes today", "The future", Arrays.asList("The future", "Your nose", "A mirror", "Time")),
            new Riddle("Dig and it grows wide\nEmpty space expands below\nMore dirt, bigger hole", "A hole", Arrays.asList("A hole", "A pile", "A debt", "A gap")),
            new Riddle("Cities, no houses\nMountains, trees, and rivers drawn\nPaper holds the world", "A map", Arrays.asList("A map", "A globe", "A drawing", "A model")),
            new Riddle("Has a bed, no sleep\nWater flows through stone and sand\nJourney to the sea", "A river", Arrays.asList("A river", "A truck", "A garden", "A bedroom")),
            new Riddle("Runs but has no legs\nFlows downhill, never walks back\nLife drinks from its path", "Water", Arrays.asList("Water", "A clock", "A nose", "A motor")),
            new Riddle("Face with hands that move\nNo eyes to see the passing\nTicks the seconds by", "A clock", Arrays.asList("A clock", "A coin", "A die", "A card")),
            new Riddle("Cracked, made, told, played\nLaughter bursts from word and wit\nJoy in punchline form", "A joke", Arrays.asList("A joke", "A code", "A game", "A nut")),
            new Riddle("Heart that does not beat\nGreen leaves guard the tender core\nSteam reveals the prize", "An artichoke", Arrays.asList("An artichoke", "A stone", "A tree", "A machine")),
            new Riddle("Speak and it is gone\nQuiet holds the loudest power\nListen to the hush", "Silence", Arrays.asList("Silence", "Glass", "A promise", "Trust")),
            new Riddle("Many keys, no locks\nIvory sings beneath the hands\nSongs without a door", "A piano", Arrays.asList("A piano", "A keyboard", "A map", "A typewriter")),
            new Riddle("Left hand holds it tight\nRight hand cannot reach its bend\nElbow knows the trick", "Your right elbow", Arrays.asList("Your right elbow", "A feather", "A pencil", "A coin")),
            new Riddle("Bottom at the top\nTwo legs carry you along\nFeet touch ground below", "Your legs", Arrays.asList("Your legs", "A bottle", "A mountain", "A cup")),
            new Riddle("Through towns, over hills\nNever moves an inch itself\nCars and feet travel", "A road", Arrays.asList("A road", "A river", "A train", "A path")),
            new Riddle("Morning four legs crawl\nNoon walks on two upright legs\nEvening adds a cane", "A human", Arrays.asList("A human", "A dog", "A cat", "A bird"))
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

        String prompt = "Generate a single short riddle in strict 5-7-5 haiku format (three lines with 5, 7, 5 syllables). " +
                "Return ONLY a JSON object with exactly these fields: " +
                "question (string with \\n line breaks for the three haiku lines), answer (string), choices (array of 4 strings including the correct answer). " +
                "Make the riddle clever but solvable in 15 seconds. No extra text, no markdown formatting.";

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
            if (question != null && answer != null && choices != null && choices.size() == 4) {
                return new Riddle(question, answer, choices);
            }
        } catch (Exception e) {
            // Parse failed
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