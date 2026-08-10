package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class SoundConductorGenerator implements SinglePlayerGameGenerator {
    private static final String SYSTEM_PROMPT = """
            你为 6-12 岁儿童实时生成“声音小指挥”结构化无歌词乐段。不得引用现有歌曲、固定旋律、真实姓名或私人信息。
            前端会用 Web Audio API 合成，所以只能返回结构化音符，不返回音频 URL。tempo 50-170，meter 2-6，dynamics 只能 SOFT/MEDIUM/STRONG，instrumentFamily 使用 KEYS/STRINGS/WOODWIND/PERCUSSION，mood 使用适龄非恐怖词。
            只返回 JSON：safety、instruction、demo、恰好三个 rounds、result。demo 和每轮都含 sequence：{"tempo":整数,"dynamics":"...","instrumentFamily":"...","meter":整数,"mood":"...","notes":[{"midi":48到84,"beats":0.25到4}]}。
            demo 只示范一个可测量特征。r1 让儿童选出 AI 测得的速度、力度、音色或节拍；r2 让儿童用可听证据核对感受，情绪可有多个合理答案；r3 只改变 tempo、dynamics、instrumentFamily 或 meter 中一个参数，比较改变前后。
            每轮还含 roundId、title、prompt、options。option 格式 {"id":"...","label":"...","value":"SLOW|MEDIUM|FAST|SOFT|STRONG|KEYS|...","kind":"CHOICE|MOOD|EVIDENCE","evidenceMetric":"TEMPO|DYNAMICS|INSTRUMENT|METER"}。
            answer 格式 {"questionType":"TEMPO|DYNAMICS|INSTRUMENT|METER|MOOD_EVIDENCE|CHANGE","changedMetric":"","hint":"引用本段参数的线索","feedback":"引用本段可观察证据的讲评","comparison":{},"ability":{}}。情绪题必须允许多个感受，只按是否选择速度、力度、音色或节拍证据判断。
            result 的 evidence、aiCorrect、uncertain、change、discovery 和 limitation 必须根据本局实际参数生成。只返回 JSON，不要 Markdown。
            """;

    private final SinglePlayerAiClient client;
    private final GameContentValidator validator;
    private final ObjectMapper objectMapper;

    SoundConductorGenerator(SinglePlayerAiClient client, GameContentValidator validator, ObjectMapper objectMapper) {
        this.client = client;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    @Override
    public String gameCode() {
        return "sound-conductor";
    }

    @Override
    public void ensureConfigured() {
        client.requireTextConfiguration();
    }

    @Override
    public GeneratedGame generate(GenerationRequest request) {
        ObjectNode context = objectMapper.createObjectNode();
        context.put("gameCode", gameCode());
        context.put("levelNo", request.levelNo());
        context.put("ageBand", request.ageBand());
        context.put("learningGoal", request.learningGoal());
        context.put("seed", request.seed());
        context.put("locale", "zh-CN");
        JsonNode generated = client.generateJson(SYSTEM_PROMPT, context);
        validator.validateSoundSequence(generated.path("demo").path("sequence"));
        JsonNode rounds = generated.path("rounds");
        if (!rounds.isArray() || rounds.size() != 3) throw invalid();
        validateSingleSequenceChange(
                rounds.path(1).path("sequence"),
                rounds.path(2).path("sequence"),
                rounds.path(2).path("answer").path("changedMetric").asText("")
        );
        for (JsonNode round : generated.path("rounds")) {
            validator.validateSoundSequence(round.path("sequence"));
            deriveAnswer(round);
        }
        return validator.splitAndValidate(gameCode(), generated, client.modelName());
    }

    private void validateSingleSequenceChange(JsonNode before, JsonNode after, String declaredMetric) {
        String changed = "";
        int changes = 0;
        for (String field : new String[]{"tempo", "dynamics", "instrumentFamily", "meter"}) {
            if (!before.path(field).equals(after.path(field))) {
                changes += 1;
                changed = field.toUpperCase(Locale.ROOT).replace("INSTRUMENTFAMILY", "INSTRUMENT");
            }
        }
        if (!before.path("notes").equals(after.path("notes"))) changes += 1;
        if (changes != 1 || !changed.equals(declaredMetric.toUpperCase(Locale.ROOT))) throw invalid();
    }

    private void deriveAnswer(JsonNode round) {
        JsonNode sequence = round.path("sequence");
        JsonNode answer = round.path("answer");
        if (!answer.isObject() || !round.path("options").isArray()) throw invalid();
        String questionType = answer.path("questionType").asText("").toUpperCase(Locale.ROOT);
        String expected = switch (questionType) {
            case "TEMPO" -> tempoBand(sequence.path("tempo").asInt());
            case "DYNAMICS" -> sequence.path("dynamics").asText("").toUpperCase(Locale.ROOT);
            case "INSTRUMENT" -> sequence.path("instrumentFamily").asText("").toUpperCase(Locale.ROOT);
            case "METER" -> String.valueOf(sequence.path("meter").asInt());
            case "CHANGE" -> answer.path("changedMetric").asText("").toUpperCase(Locale.ROOT);
            case "MOOD_EVIDENCE" -> "MOOD";
            default -> "";
        };
        if (expected.isBlank()) throw invalid();
        ArrayNode accepted = objectMapper.createArrayNode();
        ArrayNode evidence = objectMapper.createArrayNode();
        for (JsonNode option : round.path("options")) {
            String id = option.path("id").asText("");
            String value = option.path("value").asText("").toUpperCase(Locale.ROOT);
            String kind = option.path("kind").asText("CHOICE").toUpperCase(Locale.ROOT);
            if (("MOOD_EVIDENCE".equals(questionType) && "MOOD".equals(kind)) || value.equals(expected)) accepted.add(id);
            if ("MOOD_EVIDENCE".equals(questionType)
                    && "EVIDENCE".equals(kind)
                    && Set.of("TEMPO", "DYNAMICS", "INSTRUMENT", "METER")
                    .contains(option.path("evidenceMetric").asText("").toUpperCase(Locale.ROOT))) {
                evidence.add(id);
            }
        }
        if (accepted.isEmpty() || ("MOOD_EVIDENCE".equals(questionType) && evidence.isEmpty())) throw invalid();
        ObjectNode mutable = (ObjectNode) answer;
        mutable.set("acceptedOptionIds", accepted);
        mutable.put("mode", "MOOD_EVIDENCE".equals(questionType) || accepted.size() > 1 ? "ANY" : "EXACT");
        if (!evidence.isEmpty()) mutable.set("requiredAnyOptionIds", evidence);
        mutable.remove("questionType");
        mutable.remove("changedMetric");
    }

    private static String tempoBand(int tempo) {
        if (tempo < 82) return "SLOW";
        if (tempo > 118) return "FAST";
        return "MEDIUM";
    }

    private static GenerationFailure invalid() {
        return new GenerationFailure("SOUND_GAME_SCHEMA_INVALID", "声音关卡结构未通过校验", "FAILED", true);
    }
}
