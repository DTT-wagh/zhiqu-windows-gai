package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class GameContentValidator {
    private static final Pattern CONTACT = Pattern.compile(
            "(?i)(1[3-9]\\d{9}|[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}|QQ|微信|wechat|住址|家庭地址|学校地址|GPS|身份证)"
    );
    private static final Pattern UNSAFE = Pattern.compile(
            "(?i)(色情|自杀|毒品|赌博|仇恨|血腥|恐怖袭击|武器制作|真实导航|在世艺术家|受版权保护角色)"
    );
    private static final Set<String> FORBIDDEN_PUBLIC_KEYS = Set.of(
            "answer", "answerspec", "correctoptionids", "acceptedoptionids", "requiredanyoptionids", "solution", "solverresult"
    );
    private final ObjectMapper objectMapper;

    GameContentValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    GeneratedGame splitAndValidate(String gameCode, JsonNode generated, String modelName) {
        requireObject(generated, "AI_RESPONSE_INVALID");
        validateSafety(generated.path("safety"));
        requireText(generated.path("instruction"), 240, "GAME_INSTRUCTION_INVALID");
        requireObject(generated.path("demo"), "GAME_DEMO_INVALID");
        requireObject(generated.path("result"), "GAME_RESULT_INVALID");
        requireText(generated.path("result").path("evidence"), 500, "GAME_RESULT_INVALID");
        requireText(generated.path("result").path("aiCorrect"), 500, "GAME_RESULT_INVALID");
        requireText(generated.path("result").path("uncertain"), 500, "GAME_RESULT_INVALID");
        requireText(generated.path("result").path("change"), 500, "GAME_RESULT_INVALID");
        requireText(generated.path("result").path("discovery"), 500, "GAME_RESULT_INVALID");
        requireText(generated.path("result").path("limitation"), 500, "GAME_RESULT_INVALID");
        JsonNode rounds = generated.path("rounds");
        if (!rounds.isArray() || rounds.size() != 3) throw failure("GAME_ROUNDS_INVALID");

        ObjectNode publicContent = (ObjectNode) generated.deepCopy();
        publicContent.remove("safety");
        ObjectNode answerSpec = objectMapper.createObjectNode();
        ArrayNode answers = answerSpec.putArray("rounds");
        Set<String> roundIds = new HashSet<>();
        for (int index = 0; index < 3; index += 1) {
            JsonNode generatedRound = rounds.get(index);
            requireObject(generatedRound, "GAME_ROUND_INVALID");
            String expectedId = "r" + (index + 1);
            String roundId = generatedRound.path("roundId").asText("");
            if (!expectedId.equals(roundId) || !roundIds.add(roundId)) throw failure("GAME_ROUND_INVALID");
            requireText(generatedRound.path("prompt"), 500, "GAME_ROUND_INVALID");
            if (!generatedRound.path("options").isArray() || generatedRound.path("options").size() < 2) {
                throw failure("GAME_OPTIONS_INVALID");
            }
            JsonNode answer = generatedRound.path("answer");
            requireObject(answer, "GAME_ANSWER_INVALID");
            requireText(answer.path("hint"), 360, "GAME_HINT_INVALID");
            requireText(answer.path("feedback"), 600, "GAME_FEEDBACK_INVALID");
            ObjectNode stored = (ObjectNode) answer.deepCopy();
            stored.put("roundId", roundId);
            answers.add(stored);
            ((ObjectNode) publicContent.path("rounds").get(index)).remove("answer");
        }
        scanStrings(publicContent, 0);
        ensureNoAnswers(publicContent, 0);
        return new GeneratedGame(publicContent, answerSpec, modelName);
    }

    void validateSoundSequence(JsonNode sequence) {
        requireObject(sequence, "SOUND_SEQUENCE_INVALID");
        int tempo = sequence.path("tempo").asInt(-1);
        if (tempo < 50 || tempo > 170) throw failure("SOUND_TEMPO_INVALID");
        int meter = sequence.path("meter").asInt(-1);
        if (meter < 2 || meter > 6) throw failure("SOUND_METER_INVALID");
        String dynamics = sequence.path("dynamics").asText("").toUpperCase(Locale.ROOT);
        if (!Set.of("SOFT", "MEDIUM", "STRONG").contains(dynamics)) throw failure("SOUND_DYNAMICS_INVALID");
        JsonNode notes = sequence.path("notes");
        if (!notes.isArray() || notes.size() < 4 || notes.size() > 32) throw failure("SOUND_NOTES_INVALID");
        for (JsonNode note : notes) {
            int midi = note.path("midi").asInt(-1);
            double beats = note.path("beats").asDouble(-1);
            if (midi < 48 || midi > 84 || beats <= 0 || beats > 4) throw failure("SOUND_NOTES_INVALID");
        }
    }

    void validateImageConsistency(JsonNode sceneSpec, JsonNode recognition) {
        validateSafety(recognition.path("safety"));
        JsonNode elements = sceneSpec.path("elements");
        JsonNode detections = recognition.path("detections");
        if (!elements.isArray() || elements.size() < 2 || !detections.isArray()) throw failure("IMAGE_SCENE_INVALID");
        Set<String> expected = new HashSet<>();
        String primary = "";
        for (JsonNode element : elements) {
            String id = element.path("id").asText("");
            if (id.isBlank()) throw failure("IMAGE_SCENE_INVALID");
            expected.add(id);
            if (element.path("primary").asBoolean(false)) primary = id;
        }
        Set<String> detected = new HashSet<>();
        for (JsonNode item : detections) {
            String id = item.path("sceneElementId").asText("");
            double confidence = item.path("confidence").asDouble(0d);
            if (expected.contains(id) && confidence >= 0.45d) detected.add(id);
        }
        int minimum = Math.max(2, (int) Math.ceil(expected.size() * 0.6d));
        if (detected.size() < minimum || (!primary.isBlank() && !detected.contains(primary))) {
            throw new GenerationFailure("IMAGE_VISION_MISMATCH", "图片与场景规格不一致", "REJECTED", true);
        }
        requireText(recognition.path("altText"), 500, "IMAGE_ALT_INVALID");
    }

    private void validateSafety(JsonNode safety) {
        String status = safety.isTextual() ? safety.asText("") : safety.path("status").asText("");
        if (!"SAFE".equalsIgnoreCase(status)) {
            throw new GenerationFailure("AI_CONTENT_REJECTED", "本次内容未通过儿童安全审核", "REJECTED", true);
        }
    }

    private void scanStrings(JsonNode node, int depth) {
        if (depth > 20) throw failure("GAME_CONTENT_TOO_DEEP");
        if (node.isTextual()) {
            String text = node.asText("");
            if (text.length() > 3000 || CONTACT.matcher(text).find() || UNSAFE.matcher(text).find()) {
                throw new GenerationFailure("AI_CONTENT_REJECTED", "本次内容未通过儿童安全审核", "REJECTED", true);
            }
        }
        for (JsonNode child : node) scanStrings(child, depth + 1);
    }

    private void ensureNoAnswers(JsonNode node, int depth) {
        if (depth > 20) throw failure("GAME_CONTENT_TOO_DEEP");
        if (node.isObject()) {
            node.properties().forEach(entry -> {
                if (FORBIDDEN_PUBLIC_KEYS.contains(entry.getKey().toLowerCase(Locale.ROOT))) {
                    throw failure("ANSWER_SPEC_EXPOSED");
                }
                ensureNoAnswers(entry.getValue(), depth + 1);
            });
        } else if (node.isArray()) {
            node.forEach(child -> ensureNoAnswers(child, depth + 1));
        }
    }

    private static void requireObject(JsonNode node, String code) {
        if (node == null || !node.isObject()) throw failure(code);
    }

    private static void requireText(JsonNode node, int max, String code) {
        if (node == null || !node.isTextual() || node.asText("").isBlank() || node.asText().length() > max) {
            throw failure(code);
        }
    }

    private static GenerationFailure failure(String code) {
        return new GenerationFailure(code, "AI 返回内容未通过结构校验", "FAILED", true);
    }
}
