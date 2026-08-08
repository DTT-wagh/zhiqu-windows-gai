package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import java.util.Locale;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class PromptWriterGenerator implements SinglePlayerGameGenerator {
    private static final String SYSTEM_PROMPT = """
            你为 6-12 岁儿童实时生成“提示词小作家”观察关卡。目标不是教提示词模板，而是观察 AI 如何提取对象、动作、地点、数量、顺序与条件。
            每次必须创造全新的安全题面，不得套用示例、真实姓名、学校、住址、联系方式或受版权保护角色。只考 learningGoal 指定的一项能力。
            只返回 JSON 对象且 safety.status 必须是 SAFE 或 REJECTED。必须有 instruction、demo、恰好三个 rounds 和 result。
            每轮格式：{"roundId":"r1","title":"...","original":"...","aiExtracted":["..."],"prompt":"...","options":[{"id":"...","label":"...","fieldKey":"object|action|location|quantity|order|audience|tone|format|condition","value":"...","clear":true,"ambiguous":false,"conflictGroup":"","changedField":""}],"answer":{"rule":{"type":"FIELD|AMBIGUITY|CONFLICT|CHANGE|MISSING|COMPARISON","targetField":"...","ambiguousToken":"...","conflictGroup":"...","changedField":"..."},"hint":"只引用本轮内容的可操作线索","feedback":"只引用本轮操作的即时讲评","comparison":{"before":"...","after":"..."},"ability":{"taskCompletion":1,"evidenceUse":1,"revisionQuality":1,"explanationClarity":1}}}。
            result 必须包含基于本局内容的 discovery 和 limitation。不要输出 Markdown，不要把“好看”当评分标准。
            """;

    private final SinglePlayerAiClient client;
    private final GameContentValidator validator;
    private final ObjectMapper objectMapper;

    PromptWriterGenerator(SinglePlayerAiClient client, GameContentValidator validator, ObjectMapper objectMapper) {
        this.client = client;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    @Override
    public String gameCode() {
        return "prompt-writer";
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
        context.put("safetyProfile", "children-6-12");
        JsonNode generated = client.generateJson(SYSTEM_PROMPT, context);
        deriveAnswers(generated);
        return validator.splitAndValidate(gameCode(), generated, client.modelName());
    }

    private void deriveAnswers(JsonNode generated) {
        if (!generated.path("rounds").isArray()) throw invalid();
        for (JsonNode round : generated.path("rounds")) {
            JsonNode answer = round.path("answer");
            JsonNode rule = answer.path("rule");
            if (!answer.isObject() || !rule.isObject()) throw invalid();
            String type = rule.path("type").asText("").toUpperCase(Locale.ROOT);
            ArrayNode accepted = objectMapper.createArrayNode();
            for (JsonNode option : round.path("options")) {
                boolean matches = switch (type) {
                    case "FIELD", "MISSING" -> option.path("clear").asBoolean(false)
                            && option.path("fieldKey").asText("").equals(rule.path("targetField").asText(""));
                    case "AMBIGUITY" -> option.path("clear").asBoolean(false)
                            && !option.path("ambiguous").asBoolean(false);
                    case "CONFLICT" -> !rule.path("conflictGroup").asText("").isBlank()
                            && option.path("conflictGroup").asText("").equals(rule.path("conflictGroup").asText(""));
                    case "CHANGE" -> !rule.path("changedField").asText("").isBlank()
                            && option.path("changedField").asText("").equals(rule.path("changedField").asText(""));
                    case "COMPARISON" -> option.path("clarityScore").asInt(0) == maximumClarity(round.path("options"));
                    default -> false;
                };
                if (matches) accepted.add(option.path("id").asText(""));
            }
            if (accepted.isEmpty() || accepted.size() > 2) throw invalid();
            ObjectNode mutable = (ObjectNode) answer;
            mutable.set("acceptedOptionIds", accepted);
            mutable.put("mode", accepted.size() == 1 ? "EXACT" : "ANY");
            mutable.remove("rule");
        }
    }

    private static int maximumClarity(JsonNode options) {
        int maximum = Integer.MIN_VALUE;
        for (JsonNode option : options) maximum = Math.max(maximum, option.path("clarityScore").asInt(0));
        return maximum;
    }

    private static GenerationFailure invalid() {
        return new GenerationFailure("PROMPT_GAME_SCHEMA_INVALID", "文字关卡结构未通过校验", "FAILED", true);
    }
}
