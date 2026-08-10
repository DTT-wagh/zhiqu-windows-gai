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
            每次必须创造全新的安全题面，不得套用示例、真实姓名、学校、住址、联系方式或受版权保护角色。
            只返回 JSON 对象且 safety.status 必须是 SAFE 或 REJECTED。必须有 instruction、demo、恰好三个 rounds 和 result。
            demo 只把原始短句和 AI 提取结果并排展示。r1 让儿童找出 AI 已提取的信息；r2 让儿童找出遗漏、含糊或冲突；r3 必须只改变一个字段并比较改变前后。
            每轮格式：{"roundId":"r1","title":"...","original":"...","aiExtracted":["..."],"prompt":"...","options":[{"id":"...","label":"...","fieldKey":"object|action|location|quantity|order|audience|tone|format|condition","value":"...","clear":true,"ambiguous":false,"conflictGroup":"","changedField":""}],"answer":{"rule":{"type":"FIELD|AMBIGUITY|CONFLICT|CHANGE|MISSING","targetField":"...","ambiguousToken":"...","conflictGroup":"...","changedField":"..."},"hint":"只引用本轮内容的可操作线索","feedback":"只引用本轮操作的即时讲评","comparison":{"before":"...","after":"..."},"ability":{"taskCompletion":1,"evidenceUse":1,"revisionQuality":1,"explanationClarity":1}}}。
            三轮的 rule 必须严格遵守以下约定，不得使用 COMPARISON：
            r1 只能使用 FIELD，targetField 非空；恰好一项同时满足 fieldKey=targetField 且 clear=true。
            r2 只能使用 MISSING、AMBIGUITY 或 CONFLICT。MISSING 的正确项满足 fieldKey=targetField 且 clear=false；AMBIGUITY 的正确项满足 fieldKey=targetField 且 ambiguous=true；CONFLICT 的正确项具有与 rule 相同的非空 conflictGroup。正确项最多两项。
            r3 只能使用 CHANGE，changedField 非空；恰好一项的 changedField 与 rule 相同，其余项必须是不同字段。
            result 必须包含基于本局内容的 evidence、aiCorrect、uncertain、change、discovery 和 limitation。不要输出 Markdown，不要把“好看”当评分标准。
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
        for (int roundIndex = 0; roundIndex < generated.path("rounds").size(); roundIndex += 1) {
            JsonNode round = generated.path("rounds").get(roundIndex);
            JsonNode answer = round.path("answer");
            JsonNode rule = answer.path("rule");
            if (!answer.isObject() || !rule.isObject()) throw invalid();
            String type = rule.path("type").asText("").toUpperCase(Locale.ROOT);
            boolean allowedType = switch (roundIndex) {
                case 0 -> "FIELD".equals(type);
                case 1 -> "MISSING".equals(type) || "AMBIGUITY".equals(type) || "CONFLICT".equals(type);
                case 2 -> "CHANGE".equals(type);
                default -> false;
            };
            if (!allowedType) throw invalid();
            ArrayNode accepted = objectMapper.createArrayNode();
            for (JsonNode option : round.path("options")) {
                boolean matches = switch (type) {
                    case "FIELD" -> option.path("clear").asBoolean(false)
                            && option.path("fieldKey").asText("").equals(rule.path("targetField").asText(""));
                    case "MISSING" -> !option.path("clear").asBoolean(false)
                            && option.path("fieldKey").asText("").equals(rule.path("targetField").asText(""));
                    case "AMBIGUITY" -> option.path("ambiguous").asBoolean(false)
                            && option.path("fieldKey").asText("").equals(rule.path("targetField").asText(""));
                    case "CONFLICT" -> !rule.path("conflictGroup").asText("").isBlank()
                            && option.path("conflictGroup").asText("").equals(rule.path("conflictGroup").asText(""));
                    case "CHANGE" -> !rule.path("changedField").asText("").isBlank()
                            && option.path("changedField").asText("").equals(rule.path("changedField").asText(""));
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

    private static GenerationFailure invalid() {
        return new GenerationFailure("PROMPT_GAME_SCHEMA_INVALID", "文字关卡结构未通过校验", "FAILED", true);
    }
}
