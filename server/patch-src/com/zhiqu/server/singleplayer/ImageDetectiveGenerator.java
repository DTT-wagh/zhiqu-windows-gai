package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import com.zhiqu.server.singleplayer.SinglePlayerMediaStore.MediaRef;
import java.util.HashSet;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class ImageDetectiveGenerator implements SinglePlayerGameGenerator {
    private static final String SYSTEM_PROMPT = """
            你为 6-12 岁儿童实时设计“图片侦探”观察关卡。先生成原创 sceneSpec，再由另一个视觉模型核验真实图片。
            禁止真实人物身份、学校住址、版权角色、在世艺术家风格、文字水印、危险或恐怖主题。颜色不能是唯一线索。
            只返回 JSON：safety、instruction、sceneSpec、demo、恰好三个 rounds、result。
            sceneSpec 格式：{"imagePrompt":"用于生成原创方形儿童插画的详细中文描述","elements":[{"id":"稳定英文ID","label":"...","primary":true或false,"color":"颜色加明暗","shape":"...","x":0到100,"y":0到100,"relation":"..."}]}，至少 2 个元素且恰好一个主体。
            每轮含 roundId、title、prompt、options；option 格式 {"id":"...","label":"...","elementId":"...","value":"...","key":"element|color-shape|position|quantity|relation|change"}。
            answer 格式 {"targetElementId":"...","targetValue":"...","targetKey":"element|color-shape|position|quantity|relation|change","hint":"引用本图元素和位置的线索","feedback":"引用本图实际观察的讲评","comparison":{},"ability":{}}。
            demo 和 result 的 discovery、limitation 必须引用本次 sceneSpec，提醒视觉识别可能漏看。只返回 JSON，不要 Markdown。
            """;

    private final SinglePlayerAiClient client;
    private final SinglePlayerMediaStore mediaStore;
    private final GameContentValidator validator;
    private final ObjectMapper objectMapper;

    ImageDetectiveGenerator(
            SinglePlayerAiClient client,
            SinglePlayerMediaStore mediaStore,
            GameContentValidator validator,
            ObjectMapper objectMapper
    ) {
        this.client = client;
        this.mediaStore = mediaStore;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    @Override
    public String gameCode() {
        return "image-detective";
    }

    @Override
    public void ensureConfigured() {
        client.requireImageConfiguration();
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
        JsonNode sceneSpec = generated.path("sceneSpec");
        validateScene(sceneSpec);
        SinglePlayerAiClient.ImagePayload image = client.generateImage(sceneSpec.path("imagePrompt").asText());
        JsonNode recognition = client.analyzeImage(image, sceneSpec);
        validator.validateImageConsistency(sceneSpec, recognition);
        MediaRef media = mediaStore.saveImage(request.instanceId(), image.bytes(), image.contentType());
        attachMedia(generated, recognition, media.url());
        deriveAnswers(generated, recognition);
        return validator.splitAndValidate(gameCode(), generated, client.modelName() + "+" + client.modelName());
    }

    private void validateScene(JsonNode sceneSpec) {
        if (!sceneSpec.isObject() || sceneSpec.path("imagePrompt").asText("").isBlank()
                || !sceneSpec.path("elements").isArray() || sceneSpec.path("elements").size() < 2
                || sceneSpec.path("elements").size() > 7) throw invalid();
        int primaryCount = 0;
        Set<String> ids = new HashSet<>();
        for (JsonNode element : sceneSpec.path("elements")) {
            if (!ids.add(element.path("id").asText("")) || element.path("label").asText("").isBlank()
                    || element.path("shape").asText("").isBlank() || element.path("color").asText("").isBlank()) throw invalid();
            if (element.path("primary").asBoolean(false)) primaryCount += 1;
        }
        if (primaryCount != 1) throw invalid();
    }

    private void attachMedia(JsonNode generated, JsonNode recognition, String imageUrl) {
        ObjectNode mutable = (ObjectNode) generated;
        mutable.put("imageUrl", imageUrl);
        mutable.put("altText", recognition.path("altText").asText());
        mutable.set("aiDetected", recognition.path("detections").deepCopy());
        attach(generated.path("demo"), imageUrl, recognition.path("altText").asText());
        for (JsonNode round : generated.path("rounds")) attach(round, imageUrl, recognition.path("altText").asText());
    }

    private static void attach(JsonNode node, String imageUrl, String altText) {
        if (node.isObject()) {
            ((ObjectNode) node).put("imageUrl", imageUrl);
            ((ObjectNode) node).put("altText", altText);
        }
    }

    private void deriveAnswers(JsonNode generated, JsonNode recognition) {
        Set<String> detected = new HashSet<>();
        recognition.path("detections").forEach(item -> detected.add(item.path("sceneElementId").asText("")));
        for (JsonNode round : generated.path("rounds")) {
            JsonNode answer = round.path("answer");
            if (!answer.isObject()) throw invalid();
            String targetElement = answer.path("targetElementId").asText("");
            String targetValue = answer.path("targetValue").asText("");
            String targetKey = answer.path("targetKey").asText("");
            if (!targetElement.isBlank() && !detected.contains(targetElement)) {
                throw new GenerationFailure("IMAGE_TARGET_NOT_DETECTED", "视觉模型没有识别到题目目标", "REJECTED", true);
            }
            ArrayNode accepted = objectMapper.createArrayNode();
            for (JsonNode option : round.path("options")) {
                boolean elementMatch = !targetElement.isBlank() && option.path("elementId").asText("").equals(targetElement);
                boolean valueMatch = !targetValue.isBlank() && option.path("value").asText("").equals(targetValue);
                boolean keyMatch = targetKey.isBlank() || option.path("key").asText("").equals(targetKey);
                if (keyMatch && (elementMatch || valueMatch)) accepted.add(option.path("id").asText(""));
            }
            if (accepted.isEmpty()) throw invalid();
            ObjectNode mutable = (ObjectNode) answer;
            mutable.set("acceptedOptionIds", accepted);
            mutable.put("mode", accepted.size() > 1 ? "ANY" : "EXACT");
            mutable.remove("targetElementId");
            mutable.remove("targetValue");
            mutable.remove("targetKey");
        }
    }

    private static GenerationFailure invalid() {
        return new GenerationFailure("IMAGE_GAME_SCHEMA_INVALID", "图片关卡结构未通过校验", "FAILED", true);
    }
}
