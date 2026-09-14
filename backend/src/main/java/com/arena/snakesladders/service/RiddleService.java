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
            new Riddle("What has keys but can't open locks?", "A piano", Arrays.asList("A piano", "A map", "A computer", "A door")),
            new Riddle("What has a head and a tail but no body?", "A coin", Arrays.asList("A coin", "A snake", "A comet", "A worm")),
            new Riddle("What gets wetter the more it dries?", "A towel", Arrays.asList("A towel", "A sponge", "A cloth", "A mop")),
            new Riddle("What can you catch but not throw?", "A cold", Arrays.asList("A cold", "A ball", "A fish", "A frisbee")),
            new Riddle("What has many teeth but can't bite?", "A comb", Arrays.asList("A comb", "A saw", "A zipper", "A gear")),
            new Riddle("What has legs but cannot walk?", "A table", Arrays.asList("A table", "A chair", "A stool", "A bed")),
            new Riddle("What has an eye but cannot see?", "A needle", Arrays.asList("A needle", "A storm", "A potato", "A camera")),
            new Riddle("What goes up but never comes down?", "Your age", Arrays.asList("Your age", "A balloon", "Smoke", "A rocket")),
            new Riddle("What has words but never speaks?", "A book", Arrays.asList("A book", "A dictionary", "A letter", "A sign")),
            new Riddle("What has a neck but no head?", "A bottle", Arrays.asList("A bottle", "A shirt", "A guitar", "A vase")),
            new Riddle("What can travel around the world while staying in a corner?", "A stamp", Arrays.asList("A stamp", "A coin", "A postcard", "A letter")),
            new Riddle("What has a thumb and four fingers but is not alive?", "A glove", Arrays.asList("A glove", "A hand", "A mitten", "A puppet")),
            new Riddle("What is full of holes but still holds water?", "A sponge", Arrays.asList("A sponge", "A net", "A colander", "A bucket")),
            new Riddle("What can you break without touching it?", "A promise", Arrays.asList("A promise", "A heart", "A record", "A rule")),
            new Riddle("What goes up and down but doesn't move?", "A staircase", Arrays.asList("A staircase", "An elevator", "A ladder", "A hill")),
            new Riddle("What has a ring but no finger?", "A phone", Arrays.asList("A phone", "A bell", "A planet", "A circle")),
            new Riddle("What has branches but no leaves?", "A bank", Arrays.asList("A bank", "A tree", "A river", "A family")),
            new Riddle("What can fill a room but takes up no space?", "Light", Arrays.asList("Light", "Air", "Sound", "Shadow")),
            new Riddle("What is always in front of you but can't be seen?", "The future", Arrays.asList("The future", "Your nose", "A mirror", "Time")),
            new Riddle("What gets bigger the more you take away?", "A hole", Arrays.asList("A hole", "A pile", "A debt", "A gap")),
            new Riddle("What has cities but no houses, mountains but no trees, water but no fish?", "A map", Arrays.asList("A map", "A globe", "A drawing", "A model")),
            new Riddle("What has a bed but never sleeps?", "A river", Arrays.asList("A river", "A truck", "A garden", "A bedroom")),
            new Riddle("What runs but never walks?", "Water", Arrays.asList("Water", "A clock", "A nose", "A motor")),
            new Riddle("What has a face but no eyes?", "A clock", Arrays.asList("A clock", "A coin", "A die", "A card")),
            new Riddle("What can be cracked, made, told, and played?", "A joke", Arrays.asList("A joke", "A code", "A game", "A nut")),
            new Riddle("What has a heart that doesn't beat?", "An artichoke", Arrays.asList("An artichoke", "A stone", "A tree", "A machine")),
            new Riddle("What is so fragile that saying its name breaks it?", "Silence", Arrays.asList("Silence", "Glass", "A promise", "Trust")),
            new Riddle("What has many keys but can't open a single lock?", "A piano", Arrays.asList("A piano", "A keyboard", "A map", "A typewriter")),
            new Riddle("What can you hold in your left hand but not your right?", "Your right elbow", Arrays.asList("Your right elbow", "A feather", "A pencil", "A coin")),
            new Riddle("What has a bottom at the top?", "Your legs", Arrays.asList("Your legs", "A bottle", "A mountain", "A cup")),
            new Riddle("What goes through towns and hills but never moves?", "A road", Arrays.asList("A road", "A river", "A train", "A path")),
            new Riddle("What has four legs in the morning, two at noon, and three in the evening?", "A human", Arrays.asList("A human", "A dog", "A cat", "A bird"))
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

        String prompt = "Generate a single short riddle suitable for a board game. " +
                "Return ONLY a JSON object with exactly these fields: " +
                "question (string), answer (string), choices (array of 4 strings including the correct answer). " +
                "Make the riddle clever but solvable in 15 seconds. No extra text.";

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