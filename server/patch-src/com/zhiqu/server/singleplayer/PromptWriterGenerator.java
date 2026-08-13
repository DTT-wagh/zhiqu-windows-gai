package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import com.zhiqu.server.singleplayer.GameInstanceRepository.PromptSetRow;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class PromptWriterGenerator implements SinglePlayerGameGenerator {
    private static final Logger LOGGER = LoggerFactory.getLogger(PromptWriterGenerator.class);
    private static final Set<String> FACT_FIELDS = Set.of(
            "object", "action", "location", "quantity", "order", "audience", "tone", "format", "condition"
    );
    private static final Map<String, String> FIELD_LABELS = Map.of(
            "object", "对象",
            "action", "动作",
            "location", "地点",
            "quantity", "数量",
            "order", "顺序",
            "audience", "人物",
            "tone", "语气",
            "format", "形式",
            "condition", "条件"
    );
    private static final String SYSTEM_PROMPT = """
            你为儿童实时生成“提示词小作家”观察关卡。不同年龄使用同一难度，不根据年龄降低或提高要求。目标不是教提示词模板，而是观察 AI 如何提取对象、动作、地点、数量、顺序与条件。
            每次必须创造全新的安全题面，不得套用示例、真实姓名、学校、住址、联系方式或受版权保护角色。
            只返回 JSON 对象且 safety.status 必须是 SAFE 或 REJECTED。必须有 instruction、demo、恰好三个 rounds 和 result。
            demo 只把原始短句和 AI 提取结果并排展示。三轮必须形成固定递增梯度：r1 是基础识别，让儿童找出 AI 已提取的信息；r2 是进阶核对，让儿童找出真实遗漏、原文中的含糊表达或真实冲突；r3 是综合比较，必须只改变一个原文已有字段并比较改变前后。三轮难度与用户年龄无关。

            每轮都必须提供事实证据：
            sourceFacts 是从 original 逐字提取的事实数组，每项格式为 {"factId":"本轮唯一ID","fieldKey":"object|action|location|quantity|order|audience|tone|format|condition","value":"原文中的原值","evidenceQuote":"包含该值的原文连续原句"}。value 和 evidenceQuote 必须逐字出现在 original 中。
            extractedFacts 是 AI 实际提取结果，每项格式为 {"sourceFactId":"对应sourceFacts.factId","fieldKey":"与原事实相同","value":"AI提取值"}。不得为原文没有的信息创建 sourceFact；aiExtracted 只允许展示 extractedFacts 中的内容。
            r1 和 r2 的每个 option 必须含 factId 并引用已有 sourceFacts.factId，不能用“时间”“食物”等原文没有的信息充当选项。

            每轮格式：{"roundId":"r1","title":"...","original":"...","sourceFacts":[{"factId":"f1","fieldKey":"object","value":"积木","evidenceQuote":"整理积木"}],"extractedFacts":[{"sourceFactId":"f1","fieldKey":"object","value":"积木"}],"aiExtracted":["对象：积木"],"prompt":"...","options":[{"id":"...","label":"...","factId":"f1","fieldKey":"object","beforeValue":"积木","afterValue":"木块","value":"木块","clear":true,"ambiguous":false,"conflictGroup":"","changedField":"object"}],"answer":{"rule":{"type":"FIELD|AMBIGUITY|CONFLICT|CHANGE|MISSING","targetFactId":"f1","targetField":"object","ambiguousToken":"","conflictGroup":"","changedField":""},"hint":"...","feedback":"...","comparison":{"before":"...","after":"..."},"ability":{"taskCompletion":1,"evidenceUse":1,"revisionQuality":1,"explanationClarity":1}}}。
            三轮的 rule 必须严格遵守以下约定，不得使用 COMPARISON：
            r1 只能使用 FIELD；targetFactId 必须同时存在于 sourceFacts 和 extractedFacts，且两个 value 一致。
            r2 只能使用 MISSING、AMBIGUITY 或 CONFLICT。MISSING 的 targetFactId 必须存在于 sourceFacts 且不存在于 extractedFacts；AMBIGUITY 的 ambiguousToken 必须逐字出现在 targetFactId 的原文证据中；CONFLICT 的 targetFactId 必须在 extractedFacts 中有不同于原文的值。正确项最多两项。
            r3 只能使用 CHANGE。original 只放改变前的完整短句；prompt 必须同时逐字包含改变前和改变后的完整短句。每个选项增加 beforeValue 和 afterValue，正确项的 fieldKey 对应原文已有字段，beforeValue 逐字存在于 original，afterValue 逐字存在于 prompt 且两值不同。只能改变一个字段。
            hint、feedback 和选项只能讨论本轮 sourceFacts 中已有的事实。原文没有说明的信息只能说“原文未说明”，绝对不能说“AI 漏掉了”。
            result 必须包含基于本局内容的 evidence、aiCorrect、uncertain、change、discovery 和 limitation。不要输出 Markdown，不要把“好看”当评分标准。
            """;

    private final SinglePlayerAiClient client;
    private final GameContentValidator validator;
    private final ObjectMapper objectMapper;
    private final GameInstanceRepository repository;

    PromptWriterGenerator(
            SinglePlayerAiClient client,
            GameContentValidator validator,
            ObjectMapper objectMapper,
            GameInstanceRepository repository
    ) {
        this.client = client;
        this.validator = validator;
        this.objectMapper = objectMapper;
        this.repository = repository;
    }

    @PostConstruct
    void seedReviewedBank() {
        try {
            List<BankVariant> variants = bankVariants();
            Instant now = Instant.now();
            int seeded = 0;
            for (int index = 0; index < variants.size(); index += 1) {
                GeneratedGame game = compileBankVariant(variants.get(index));
                repository.saveApprovedPromptSet(new PromptSetRow(
                        "prompt-v1-9-10-" + (index + 1),
                        "9-10",
                        "spg-v6",
                        writeJson(game.publicContent()),
                        writeJson(game.answerSpec()),
                        "MANUAL",
                        "PromptBank-v1",
                        "APPROVED",
                        true,
                        now,
                        now,
                        now
                ));
                seeded += 1;
            }
            LOGGER.info("Reviewed prompt bank is ready with {} seeded prompt sets", seeded);
        } catch (RuntimeException failure) {
            LOGGER.error("Unable to seed reviewed prompt bank; code fallback remains available", failure);
        }
    }

    @Override
    public String gameCode() {
        return "prompt-writer";
    }

    @Override
    public void ensureConfigured() {
        // The reviewed database bank keeps this game available without a live AI provider.
    }

    @Override
    public GeneratedGame generate(GenerationRequest request) {
        GeneratedGame reviewed = databaseGame(request);
        if (reviewed != null) return reviewed;
        if (!client.textConfigured()) return fallbackGame(request);
        try {
            ObjectNode context = objectMapper.createObjectNode();
            context.put("gameCode", gameCode());
            context.put("contentVersion", "spg-v6");
            context.put("levelNo", request.levelNo());
            context.put("difficultyPolicy", "UNIFIED_PROGRESSIVE");
            context.putArray("roundDifficulty").add("FOUNDATION").add("INTERMEDIATE").add("INTEGRATED");
            context.put("learningGoal", request.learningGoal());
            context.put("seed", request.seed());
            context.put("locale", "zh-CN");
            context.put("safetyProfile", "children-6-12");
            JsonNode generated = client.generateJson(SYSTEM_PROMPT, context);
            deriveAnswers(generated);
            normalizeResult(generated);
            return validator.splitAndValidate(gameCode(), generated, client.modelName());
        } catch (GenerationFailure invalidGenerated) {
            return fallbackGame(request);
        }
    }

    private GeneratedGame databaseGame(GenerationRequest request) {
        try {
            List<PromptSetRow> rows = repository.listApprovedPromptSets(request.ageBand());
            if (rows.isEmpty()) return null;
            int start = Math.floorMod(request.seed().hashCode(), rows.size());
            for (int offset = 0; offset < rows.size(); offset += 1) {
                PromptSetRow row = rows.get((start + offset) % rows.size());
                try {
                    JsonNode publicContent = readJson(row.publicContentJson());
                    JsonNode answerSpec = readJson(row.answerSpecJson());
                    if (!validStoredGame(publicContent, answerSpec)) continue;
                    return new GeneratedGame(publicContent, answerSpec, "PromptBank-db:" + row.sourceModel());
                } catch (RuntimeException invalidRow) {
                    LOGGER.warn("Skipping invalid approved prompt set {}", row.id());
                }
            }
        } catch (RuntimeException databaseFailure) {
            LOGGER.error("Unable to read reviewed prompt bank; trying other sources", databaseFailure);
        }
        return null;
    }

    private static boolean validStoredGame(JsonNode publicContent, JsonNode answerSpec) {
        return publicContent != null && publicContent.isObject()
                && publicContent.path("rounds").isArray() && publicContent.path("rounds").size() == 3
                && answerSpec != null && answerSpec.isObject()
                && answerSpec.path("rounds").isArray() && answerSpec.path("rounds").size() == 3;
    }

    private GeneratedGame fallbackGame(GenerationRequest request) {
        BankVariant variant = bankVariants().get(Math.floorMod(request.seed().hashCode(), bankVariants().size()));
        return compileBankVariant(variant);
    }

    private GeneratedGame compileBankVariant(BankVariant variant) {
        ObjectNode generated = objectMapper.createObjectNode();
        generated.putObject("safety").put("status", "SAFE").put("reason", "审核题库");
        generated.put("instruction", "按基础、进阶、综合的顺序，对照原文和 AI 提取结果完成三轮事实观察。");
        ObjectNode demo = generated.putObject("demo");
        demo.put("title", "事实提取示范");
        demo.put("original", "一位同学在桌边整理积木。");
        demo.putArray("aiExtracted").add("人物：一位同学").add("地点：桌边").add("动作：整理").add("对象：积木");
        demo.put("explanation", "AI 只能提取原文中明确出现的信息。");

        ArrayNode rounds = generated.putArray("rounds");
        rounds.add(bankRound("r1", "基础：AI 找到了什么？", variant, "FIELD", variant.r1TargetField(), null));
        rounds.add(bankRound("r2", "进阶：AI 漏掉了什么？", variant, "MISSING", variant.r2MissingField(), null));
        rounds.add(bankRound("r3", "综合：改变一个信息，看看有什么不同", variant, "CHANGE", variant.r3ChangedField(), variant.r3AfterValue()));
        generated.putObject("result").put("discovery", "本局来自审核题库。");
        deriveAnswers(generated);
        normalizeResult(generated);
        return validator.splitAndValidate(gameCode(), generated, "PromptBank-v1");
    }

    private String writeJson(JsonNode value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to encode reviewed prompt set", error);
        }
    }

    private JsonNode readJson(String value) {
        try {
            return objectMapper.readTree(value);
        } catch (Exception error) {
            throw new IllegalStateException("Unable to decode reviewed prompt set", error);
        }
    }

    private ObjectNode bankRound(
            String roundId,
            String title,
            BankVariant variant,
            String type,
            String targetField,
            String afterValue
    ) {
        ObjectNode round = objectMapper.createObjectNode();
        round.put("roundId", roundId);
        round.put("title", title);
        round.put("original", variant.original());
        ArrayNode sourceFacts = round.putArray("sourceFacts");
        ArrayNode extractedFacts = round.putArray("extractedFacts");
        String targetFactId = "";
        for (Map.Entry<String, String> entry : variant.facts().entrySet()) {
            String factId = roundId + "-" + entry.getKey();
            sourceFacts.addObject()
                    .put("factId", factId)
                    .put("fieldKey", entry.getKey())
                    .put("value", entry.getValue())
                    .put("evidenceQuote", variant.original());
            if (entry.getKey().equals(targetField)) targetFactId = factId;
            if (!"MISSING".equals(type) || !entry.getKey().equals(targetField)) {
                extractedFacts.addObject()
                        .put("sourceFactId", factId)
                        .put("fieldKey", entry.getKey())
                        .put("value", entry.getValue());
            }
        }
        round.putArray("aiExtracted");
        ArrayNode options = round.putArray("options");
        if ("CHANGE".equals(type)) {
            String beforeValue = variant.facts().get(targetField);
            round.put("prompt", "如果把“" + variant.original() + "”中的“" + beforeValue
                    + "”改成“" + afterValue + "”，哪个信息改变了？");
            options.addObject().put("id", roundId + "-option-1").put("factId", targetFactId)
                    .put("fieldKey", targetField).put("beforeValue", beforeValue)
                    .put("afterValue", afterValue).put("value", afterValue).put("changedField", targetField);
            int index = 2;
            for (Map.Entry<String, String> entry : variant.facts().entrySet()) {
                if (entry.getKey().equals(targetField) || index > 3) continue;
                options.addObject().put("id", roundId + "-option-" + index++)
                        .put("factId", roundId + "-" + entry.getKey()).put("fieldKey", entry.getKey())
                        .put("beforeValue", entry.getValue()).put("afterValue", entry.getValue())
                        .put("value", entry.getValue()).put("changedField", "");
            }
        } else {
            round.put("prompt", "请根据原文和 AI 提取结果作答。");
            options.addObject().put("id", roundId + "-option-1");
            options.addObject().put("id", roundId + "-option-2");
        }
        ObjectNode answer = round.putObject("answer");
        answer.putObject("rule")
                .put("type", type)
                .put("targetFactId", targetFactId)
                .put("targetField", targetField)
                .put("ambiguousToken", "")
                .put("conflictGroup", "")
                .put("changedField", targetField);
        answer.put("hint", "对照原文和 AI 提取结果。");
        answer.put("feedback", "根据原文证据核对答案。");
        answer.putObject("comparison").put("before", variant.original()).put("after", variant.original());
        answer.putObject("ability")
                .put("taskCompletion", 1).put("evidenceUse", 1)
                .put("revisionQuality", 1).put("explanationClarity", 1);
        return round;
    }

    private static List<BankVariant> bankVariants() {
        return List.of(
                new BankVariant(
                        "一位同学在书桌上整理四张卡片。",
                        linkedFacts("audience", "一位同学", "location", "书桌", "action", "整理", "quantity", "四张", "object", "卡片"),
                        "object", "quantity", "quantity", "六张"
                ),
                new BankVariant(
                        "一位同学在花园里给三株向日葵浇水。",
                        linkedFacts("audience", "一位同学", "location", "花园", "quantity", "三株", "object", "向日葵", "action", "浇水"),
                        "action", "location", "action", "除草"
                ),
                new BankVariant(
                        "一位同学在操场上摆放五个圆锥。",
                        linkedFacts("audience", "一位同学", "location", "操场", "action", "摆放", "quantity", "五个", "object", "圆锥"),
                        "location", "action", "object", "方块"
                )
        );
    }

    private static LinkedHashMap<String, String> linkedFacts(String... values) {
        LinkedHashMap<String, String> facts = new LinkedHashMap<>();
        for (int index = 0; index < values.length; index += 2) facts.put(values[index], values[index + 1]);
        return facts;
    }

    private void deriveAnswers(JsonNode generated) {
        if (!generated.path("rounds").isArray()) throw invalid();
        for (int roundIndex = 0; roundIndex < generated.path("rounds").size(); roundIndex += 1) {
            JsonNode round = generated.path("rounds").get(roundIndex);
            JsonNode answer = round.path("answer");
            JsonNode rule = answer.path("rule");
            if (!round.isObject() || !answer.isObject() || !rule.isObject() || !round.path("options").isArray()) {
                throw invalid();
            }
            String type = rule.path("type").asText("").toUpperCase(Locale.ROOT);
            boolean allowedType = switch (roundIndex) {
                case 0 -> "FIELD".equals(type);
                case 1 -> "MISSING".equals(type) || "AMBIGUITY".equals(type) || "CONFLICT".equals(type);
                case 2 -> "CHANGE".equals(type);
                default -> false;
            };
            if (!allowedType) throw invalid();

            Grounding grounding = validateFacts(round);
            String targetFactId;
            if ("CHANGE".equals(type)) {
                ChangeGrounding change = resolveChangeGrounding(round, grounding);
                targetFactId = change.targetFactId();
                rebuildChangeOptions((ObjectNode) round, change, grounding);
                applyChangeFeedback((ObjectNode) round, (ObjectNode) answer, change, grounding);
            } else {
                targetFactId = resolveTargetFactId((ObjectNode) rule, type, grounding);
                rebuildGroundedOptions((ObjectNode) round, targetFactId, grounding);
                validateRuleGrounding(round, answer, rule, type, targetFactId, grounding);
            }

            ArrayNode accepted = objectMapper.createArrayNode();
            for (JsonNode option : round.path("options")) {
                if (!option.isObject()) throw invalid();
                String optionFactId = option.path("factId").asText("").trim();
                boolean matches = optionFactId.equals(targetFactId);
                if (!"CHANGE".equals(type)) {
                    JsonNode sourceFact = grounding.sourceFacts().get(optionFactId);
                    canonicalizeOption((ObjectNode) option, sourceFact, grounding.extractedFacts().get(optionFactId), type);
                }
                if (matches) accepted.add(option.path("id").asText(""));
            }
            if (accepted.isEmpty() || accepted.size() > 2) throw invalid();
            ObjectNode mutable = (ObjectNode) answer;
            mutable.set("acceptedOptionIds", accepted);
            mutable.put("mode", accepted.size() == 1 ? "EXACT" : "ANY");
            mutable.remove("rule");
        }
    }

    private Grounding validateFacts(JsonNode round) {
        String original = round.path("original").asText("").trim();
        JsonNode source = round.path("sourceFacts");
        JsonNode extracted = round.path("extractedFacts");
        if (original.isBlank() || !source.isArray() || source.size() < 2 || !extracted.isArray()) {
            throw groundingInvalid("round-facts-missing");
        }
        Map<String, JsonNode> sourceFacts = new LinkedHashMap<>();
        for (JsonNode fact : source) {
            String factId = fact.path("factId").asText("").trim();
            String fieldKey = fact.path("fieldKey").asText("").trim();
            String value = fact.path("value").asText("").trim();
            String evidence = fact.path("evidenceQuote").asText("").trim();
            if (!fact.isObject() || factId.isBlank() || factId.length() > 48 || !FACT_FIELDS.contains(fieldKey)
                    || value.isBlank() || value.length() > 120 || evidence.isBlank() || evidence.length() > 180
                    || !original.contains(evidence) || !evidence.contains(value)
                    || sourceFacts.putIfAbsent(factId, fact) != null) {
                throw groundingInvalid("source-fact-evidence");
            }
        }
        Map<String, JsonNode> extractedFacts = new LinkedHashMap<>();
        ArrayNode extractedDisplay = objectMapper.createArrayNode();
        for (JsonNode fact : extracted) {
            String sourceFactId = fact.path("sourceFactId").asText("").trim();
            String fieldKey = fact.path("fieldKey").asText("").trim();
            String value = fact.path("value").asText("").trim();
            JsonNode sourceFact = sourceFacts.get(sourceFactId);
            if (!fact.isObject() || sourceFact == null || value.isBlank() || value.length() > 120
                    || !sourceFact.path("fieldKey").asText("").equals(fieldKey)
                    || extractedFacts.putIfAbsent(sourceFactId, fact) != null) {
                throw groundingInvalid("extracted-fact-reference");
            }
            extractedDisplay.add(fieldLabel(fieldKey) + "：" + value);
        }
        ((ObjectNode) round).set("aiExtracted", extractedDisplay);
        return new Grounding(sourceFacts, extractedFacts);
    }

    private ChangeGrounding resolveChangeGrounding(JsonNode round, Grounding grounding) {
        String prompt = round.path("prompt").asText("").trim();
        if (prompt.isBlank()) throw groundingInvalid("change-prompt-missing");
        ChangeGrounding matched = null;
        for (JsonNode option : round.path("options")) {
            String fieldKey = option.path("fieldKey").asText("").trim();
            if (!FACT_FIELDS.contains(fieldKey)) fieldKey = option.path("changedField").asText("").trim();
            String explicitBefore = option.path("beforeValue").asText("").trim();
            String afterValue = option.path("afterValue").asText("").trim();
            if (afterValue.isBlank()) afterValue = option.path("value").asText("").trim();
            for (Map.Entry<String, JsonNode> entry : grounding.sourceFacts().entrySet()) {
                JsonNode sourceFact = entry.getValue();
                String beforeValue = sourceFact.path("value").asText("").trim();
                JsonNode extractedFact = grounding.extractedFacts().get(entry.getKey());
                if (!sourceFact.path("fieldKey").asText("").equals(fieldKey)
                        || (!explicitBefore.isBlank() && !beforeValue.equals(explicitBefore))
                        || afterValue.isBlank() || beforeValue.equals(afterValue)
                        || extractedFact == null || !beforeValue.equals(extractedFact.path("value").asText("").trim())
                        || !round.path("original").asText("").contains(beforeValue)
                        || !prompt.contains(beforeValue) || !prompt.contains(afterValue)) {
                    continue;
                }
                if (matched != null) throw groundingInvalid("multiple-change-candidates");
                matched = new ChangeGrounding(entry.getKey(), beforeValue, afterValue);
            }
        }
        if (matched == null) throw groundingInvalid("change-not-supported-by-prompt");
        return matched;
    }

    private void rebuildChangeOptions(ObjectNode round, ChangeGrounding change, Grounding grounding) {
        JsonNode supplied = round.path("options");
        List<String> factIds = new ArrayList<>();
        factIds.add(change.targetFactId());
        for (String factId : grounding.sourceFacts().keySet()) {
            if (!factId.equals(change.targetFactId())) factIds.add(factId);
        }
        if (factIds.size() < 2) throw groundingInvalid("change-distractor-missing");
        int optionCount = Math.min(3, factIds.size());
        int targetIndex = Math.floorMod(change.targetFactId().hashCode(), optionCount);
        List<String> ordered = new ArrayList<>();
        int distractorIndex = 1;
        for (int index = 0; index < optionCount; index += 1) {
            ordered.add(index == targetIndex ? change.targetFactId() : factIds.get(distractorIndex++));
        }
        ArrayNode rebuilt = objectMapper.createArrayNode();
        Set<String> usedIds = new java.util.HashSet<>();
        for (int index = 0; index < optionCount; index += 1) {
            String fallbackId = round.path("roundId").asText("r3") + "-option-" + (index + 1);
            String id = optionId(supplied, index, fallbackId);
            if (!usedIds.add(id)) id = fallbackId;
            String factId = ordered.get(index);
            JsonNode fact = grounding.sourceFacts().get(factId);
            String field = fieldLabel(fact.path("fieldKey").asText(""));
            String before = fact.path("value").asText("");
            ObjectNode option = objectMapper.createObjectNode();
            option.put("id", id);
            option.put("factId", factId);
            option.put("fieldKey", fact.path("fieldKey").asText(""));
            option.put("beforeValue", before);
            option.put("afterValue", factId.equals(change.targetFactId()) ? change.afterValue() : before);
            option.put("value", factId.equals(change.targetFactId()) ? change.afterValue() : before);
            option.put("label", factId.equals(change.targetFactId())
                    ? field + "从“" + before + "”变成“" + change.afterValue() + "”"
                    : field + "没有改变，仍是“" + before + "”");
            option.put("changedField", factId.equals(change.targetFactId())
                    ? fact.path("fieldKey").asText("") : "");
            rebuilt.add(option);
        }
        round.set("options", rebuilt);
    }

    private void applyChangeFeedback(
            ObjectNode round,
            ObjectNode answer,
            ChangeGrounding change,
            Grounding grounding
    ) {
        JsonNode fact = grounding.sourceFacts().get(change.targetFactId());
        String field = fieldLabel(fact.path("fieldKey").asText(""));
        String original = round.path("original").asText("");
        int valueIndex = original.indexOf(change.beforeValue());
        if (valueIndex < 0 || original.indexOf(change.beforeValue(), valueIndex + change.beforeValue().length()) >= 0) {
            throw groundingInvalid("change-source-value-not-unique");
        }
        String changedOriginal = original.substring(0, valueIndex) + change.afterValue()
                + original.substring(valueIndex + change.beforeValue().length());
        round.put("changedOriginal", changedOriginal);
        ArrayNode changedExtracted = objectMapper.createArrayNode();
        for (Map.Entry<String, JsonNode> entry : grounding.extractedFacts().entrySet()) {
            JsonNode sourceFact = grounding.sourceFacts().get(entry.getKey());
            String value = entry.getKey().equals(change.targetFactId())
                    ? change.afterValue() : entry.getValue().path("value").asText("");
            changedExtracted.add(fieldLabel(sourceFact.path("fieldKey").asText("")) + "：" + value);
        }
        round.set("changedAiExtracted", changedExtracted);
        round.put("prompt", "把原文中的" + field + "从“" + change.beforeValue()
                + "”改成“" + change.afterValue() + "”，哪个信息改变了？");
        answer.put("hint", "只比较“" + change.beforeValue() + "”和“" + change.afterValue() + "”。");
        answer.put("feedback", field + "从“" + change.beforeValue() + "”变成“"
                + change.afterValue() + "”，其他原文信息没有改变。");
        ObjectNode comparison = objectMapper.createObjectNode();
        comparison.put("before", field + "：" + change.beforeValue());
        comparison.put("after", field + "：" + change.afterValue());
        answer.set("comparison", comparison);
    }

    private String resolveTargetFactId(ObjectNode rule, String type, Grounding grounding) {
        String requestedId = rule.path("targetFactId").asText("").trim();
        String targetField = rule.path("targetField").asText("").trim();
        JsonNode requestedFact = grounding.sourceFacts().get(requestedId);
        if (requestedFact != null && requestedFact.path("fieldKey").asText("").equals(targetField)) return requestedId;

        String ambiguousToken = rule.path("ambiguousToken").asText("").trim();
        String matchedId = "";
        for (Map.Entry<String, JsonNode> entry : grounding.sourceFacts().entrySet()) {
            JsonNode sourceFact = entry.getValue();
            if (!sourceFact.path("fieldKey").asText("").equals(targetField)) continue;
            JsonNode extractedFact = grounding.extractedFacts().get(entry.getKey());
            String sourceValue = sourceFact.path("value").asText("").trim();
            String extractedValue = extractedFact == null ? "" : extractedFact.path("value").asText("").trim();
            boolean matches = switch (type) {
                case "FIELD" -> extractedFact != null && sourceValue.equals(extractedValue);
                case "MISSING" -> extractedFact == null;
                case "AMBIGUITY" -> !ambiguousToken.isBlank()
                        && sourceFact.path("evidenceQuote").asText("").contains(ambiguousToken);
                case "CONFLICT" -> extractedFact != null && !sourceValue.equals(extractedValue);
                default -> false;
            };
            if (!matches) continue;
            if (!matchedId.isBlank()) throw groundingInvalid("ambiguous-rule-target");
            matchedId = entry.getKey();
        }
        if (matchedId.isBlank()) throw groundingInvalid("rule-target-fact");
        rule.put("targetFactId", matchedId);
        return matchedId;
    }

    private void rebuildGroundedOptions(
            ObjectNode round,
            String targetFactId,
            Grounding grounding
    ) {
        JsonNode targetFact = grounding.sourceFacts().get(targetFactId);
        if (targetFact == null) throw groundingInvalid("option-target-fact");
        String targetField = targetFact.path("fieldKey").asText("");
        List<String> preferred = new ArrayList<>();
        List<String> fallback = new ArrayList<>();
        for (Map.Entry<String, JsonNode> entry : grounding.sourceFacts().entrySet()) {
            if (entry.getKey().equals(targetFactId)) continue;
            JsonNode extractedFact = grounding.extractedFacts().get(entry.getKey());
            if (extractedFact == null || !entry.getValue().path("value").asText("")
                    .equals(extractedFact.path("value").asText(""))) {
                continue;
            }
            fallback.add(entry.getKey());
            if (!entry.getValue().path("fieldKey").asText("").equals(targetField)) preferred.add(entry.getKey());
        }
        String distractorFactId = !preferred.isEmpty() ? preferred.get(0) : fallback.isEmpty() ? "" : fallback.get(0);
        if (distractorFactId.isBlank()) throw groundingInvalid("grounded-distractor-missing");

        JsonNode supplied = round.path("options");
        String firstId = optionId(supplied, 0, round.path("roundId").asText("r") + "-option-1");
        String secondId = optionId(supplied, 1, round.path("roundId").asText("r") + "-option-2");
        if (firstId.equals(secondId)) secondId = round.path("roundId").asText("r") + "-option-2";
        boolean targetFirst = Math.floorMod(targetFactId.hashCode(), 2) == 0;
        ArrayNode rebuilt = objectMapper.createArrayNode();
        rebuilt.add(optionNode(firstId, targetFirst ? targetFactId : distractorFactId, grounding));
        rebuilt.add(optionNode(secondId, targetFirst ? distractorFactId : targetFactId, grounding));
        round.set("options", rebuilt);
    }

    private ObjectNode optionNode(String optionId, String factId, Grounding grounding) {
        JsonNode fact = grounding.sourceFacts().get(factId);
        ObjectNode option = objectMapper.createObjectNode();
        option.put("id", optionId);
        option.put("label", fieldLabel(fact.path("fieldKey").asText("")) + "：" + fact.path("value").asText(""));
        option.put("factId", factId);
        option.put("fieldKey", fact.path("fieldKey").asText(""));
        option.put("value", fact.path("value").asText(""));
        option.put("clear", grounding.extractedFacts().containsKey(factId));
        option.put("ambiguous", false);
        option.put("conflictGroup", "");
        option.put("changedField", "");
        return option;
    }

    private static String optionId(JsonNode supplied, int index, String fallback) {
        if (!supplied.isArray() || supplied.size() <= index) return fallback;
        String id = supplied.get(index).path("id").asText("").trim();
        return id.isBlank() || id.length() > 80 ? fallback : id;
    }

    private void validateRuleGrounding(
            JsonNode round,
            JsonNode answer,
            JsonNode rule,
            String type,
            String targetFactId,
            Grounding grounding
    ) {
        JsonNode sourceFact = grounding.sourceFacts().get(targetFactId);
        JsonNode extractedFact = grounding.extractedFacts().get(targetFactId);
        if (sourceFact == null || !sourceFact.path("fieldKey").asText("").equals(rule.path("targetField").asText(""))) {
            throw groundingInvalid("rule-target-fact");
        }
        String sourceValue = sourceFact.path("value").asText("").trim();
        String extractedValue = extractedFact == null ? "" : extractedFact.path("value").asText("").trim();
        String evidence = sourceFact.path("evidenceQuote").asText("").trim();
        String fieldLabel = fieldLabel(sourceFact.path("fieldKey").asText(""));
        ObjectNode mutableRound = (ObjectNode) round;
        ObjectNode mutableAnswer = (ObjectNode) answer;
        ObjectNode comparison = objectMapper.createObjectNode();
        switch (type) {
            case "FIELD" -> {
                if (extractedFact == null || !sourceValue.equals(extractedValue)) {
                    throw groundingInvalid("field-not-extracted-exactly");
                }
                mutableRound.put("prompt", "AI 已经正确提取了哪一项“" + fieldLabel + "”信息？");
                mutableAnswer.put("hint", "对照原文中的“" + evidence + "”和 AI 提取结果。");
                mutableAnswer.put("feedback", "原文和 AI 提取结果都包含“" + fieldLabel + "：" + sourceValue + "”。");
                comparison.put("before", "原文：" + evidence);
                comparison.put("after", "AI 提取：" + fieldLabel + "：" + extractedValue);
            }
            case "MISSING" -> {
                if (extractedFact != null) throw groundingInvalid("missing-fact-was-extracted");
                requireOtherOptionsExtracted(round, targetFactId, grounding);
                mutableRound.put("prompt", "AI 漏掉了哪一项原文中确实出现的信息？");
                mutableAnswer.put("hint", "只比较原文中的“" + evidence + "”和 AI 提取结果，不补充原文没有的信息。");
                mutableAnswer.put("feedback", "原文写了“" + evidence + "”，但 AI 没有提取“" + fieldLabel + "：" + sourceValue + "”。");
                comparison.put("before", "原文：" + evidence);
                comparison.put("after", "AI 提取结果中没有" + fieldLabel);
            }
            case "AMBIGUITY" -> {
                String token = rule.path("ambiguousToken").asText("").trim();
                if (token.isBlank() || !round.path("original").asText("").contains(token)
                        || !evidence.contains(token) || extractedFact == null) {
                    throw groundingInvalid("ambiguity-token-evidence");
                }
                requireOtherOptionsExact(round, targetFactId, grounding);
                mutableRound.put("prompt", "原文中的哪一项表达不够明确？");
                mutableAnswer.put("hint", "在原文中找到“" + token + "”，判断它是否说清了具体的" + fieldLabel + "。");
                mutableAnswer.put("feedback", "原文确实使用了“" + token + "”，但它没有说明具体的" + fieldLabel + "。");
                comparison.put("before", "原文：" + evidence);
                comparison.put("after", "AI 提取：" + fieldLabel + "：" + extractedValue);
            }
            case "CONFLICT" -> {
                if (extractedFact == null || sourceValue.equals(extractedValue)) {
                    throw groundingInvalid("conflict-values-not-different");
                }
                requireOtherOptionsExact(round, targetFactId, grounding);
                mutableRound.put("prompt", "AI 的哪一项提取与原文发生了冲突？");
                mutableAnswer.put("hint", "比较原文中的“" + sourceValue + "”和 AI 提取的“" + extractedValue + "”。");
                mutableAnswer.put("feedback", "原文是“" + sourceValue + "”，AI 却提取成“" + extractedValue + "”，两者不一致。");
                comparison.put("before", "原文：" + evidence);
                comparison.put("after", "AI 提取：" + fieldLabel + "：" + extractedValue);
            }
            default -> throw invalid();
        }
        mutableAnswer.set("comparison", comparison);
    }

    private void requireOtherOptionsExtracted(JsonNode round, String targetFactId, Grounding grounding) {
        for (JsonNode option : round.path("options")) {
            String factId = option.path("factId").asText("").trim();
            if (!factId.equals(targetFactId) && !grounding.extractedFacts().containsKey(factId)) {
                throw groundingInvalid("missing-distractor-also-missing");
            }
        }
    }

    private void requireOtherOptionsExact(JsonNode round, String targetFactId, Grounding grounding) {
        for (JsonNode option : round.path("options")) {
            String factId = option.path("factId").asText("").trim();
            if (factId.equals(targetFactId)) continue;
            JsonNode sourceFact = grounding.sourceFacts().get(factId);
            JsonNode extractedFact = grounding.extractedFacts().get(factId);
            if (sourceFact == null || extractedFact == null
                    || !sourceFact.path("value").asText("").trim().equals(extractedFact.path("value").asText("").trim())) {
                throw groundingInvalid("distractor-not-extracted-exactly");
            }
        }
    }

    private void canonicalizeOption(ObjectNode option, JsonNode sourceFact, JsonNode extractedFact, String type) {
        String fieldKey = sourceFact.path("fieldKey").asText("");
        String label = fieldLabel(fieldKey) + "：" + sourceFact.path("value").asText("");
        if ("CONFLICT".equals(type) && extractedFact != null
                && !sourceFact.path("value").asText("").equals(extractedFact.path("value").asText(""))) {
            label = fieldLabel(fieldKey) + "：原文“" + sourceFact.path("value").asText("")
                    + "”，AI“" + extractedFact.path("value").asText("") + "”";
        }
        option.put("label", label);
        option.put("value", sourceFact.path("value").asText(""));
        option.put("fieldKey", fieldKey);
    }

    private void normalizeResult(JsonNode generated) {
        if (!generated.isObject() || !generated.path("rounds").isArray()
                || generated.path("rounds").size() != 3) {
            throw invalid();
        }
        String first = roundFeedback(generated.path("rounds").get(0));
        String second = roundFeedback(generated.path("rounds").get(1));
        String third = roundFeedback(generated.path("rounds").get(2));
        ObjectNode result = objectMapper.createObjectNode();
        result.put("evidence", "第1轮：" + first + " 第2轮：" + second);
        result.put("aiCorrect", first);
        result.put("uncertain", second);
        result.put("change", third);
        result.put("discovery", "我会对照原文证据、AI 提取结果和改变前后的信息再作判断。");
        result.put("limitation", "AI 只能根据原文明确写出的信息提取，原文未说明的内容不能算作遗漏。");
        ((ObjectNode) generated).set("result", result);
    }

    private static String roundFeedback(JsonNode round) {
        String feedback = round.path("answer").path("feedback").asText("").trim();
        if (feedback.isBlank()) throw invalid();
        return feedback;
    }

    private static String fieldLabel(String fieldKey) {
        return FIELD_LABELS.getOrDefault(fieldKey, "信息");
    }

    private static GenerationFailure invalid() {
        return new GenerationFailure("PROMPT_GAME_SCHEMA_INVALID", "文字关卡结构未通过校验", "FAILED", true);
    }

    private static GenerationFailure groundingInvalid() {
        return groundingInvalid("unspecified");
    }

    private static GenerationFailure groundingInvalid(String detail) {
        return new GenerationFailure(
                "PROMPT_GROUNDING_INVALID",
                "文字关卡中的题目、选项或反馈缺少原文证据：" + detail,
                "FAILED",
                true
        );
    }

    private record Grounding(Map<String, JsonNode> sourceFacts, Map<String, JsonNode> extractedFacts) {
    }

    private record ChangeGrounding(String targetFactId, String beforeValue, String afterValue) {
    }

    private record BankVariant(
            String original,
            LinkedHashMap<String, String> facts,
            String r1TargetField,
            String r2MissingField,
            String r3ChangedField,
            String r3AfterValue
    ) {
    }
}
