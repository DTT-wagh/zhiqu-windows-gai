package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import com.zhiqu.server.singleplayer.SinglePlayerMediaStore.MediaRef;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.Ellipse2D;
import java.awt.geom.Path2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class ImageDetectiveGenerator implements SinglePlayerGameGenerator {
    private static final String SYSTEM_PROMPT = """
            你为 6-12 岁儿童实时设计“图片侦探”的原创观察场景，另一个视觉模型会核验最终图片。
            禁止真实人物身份、学校住址、版权角色、在世艺术家风格、文字水印、危险或恐怖主题。颜色不能是唯一线索。
            只返回 JSON：safety 和 sceneSpec。safety 必须是 {"status":"SAFE","reason":"适龄且无危险内容"}。
            sceneSpec 格式：{"imagePrompt":"用于生成原创方形儿童插画的详细中文描述","elements":[{"id":"稳定英文ID","label":"颜色加形状的名称","primary":true或false,"color":"颜色加明暗","shape":"圆形|方形|三角形|星形|椭圆形","x":0到100,"y":0到100,"relation":"..."}]}，恰好 2 个几何元素且恰好一个主体。
            两个元素必须颜色不同、形状明确、坐标分开，relation 要说明与主体的空间关系。只返回 JSON，不要 Markdown。
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
        ObjectNode generated = (ObjectNode) client.generateJson(SYSTEM_PROMPT, context);
        JsonNode sceneSpec = normalizeScene(generated);
        validateScene(sceneSpec);
        JsonNode variantSceneSpec = buildVariant(generated, sceneSpec, request.seed());
        validateScene(variantSceneSpec);
        validateSingleChange(sceneSpec, variantSceneSpec, generated.path("change"));
        buildRounds(generated, sceneSpec, variantSceneSpec, generated.path("change"));
        SinglePlayerAiClient.ImagePayload image = generateSceneImage(sceneSpec);
        SinglePlayerAiClient.ImagePayload variantImage = generateSceneImage(variantSceneSpec);
        JsonNode recognition = client.analyzeImage(image, sceneSpec);
        JsonNode variantRecognition = client.analyzeImage(variantImage, variantSceneSpec);
        validator.validateImageConsistency(sceneSpec, recognition);
        validator.validateImageConsistency(variantSceneSpec, variantRecognition);
        MediaRef media = mediaStore.saveImage(request.instanceId(), image.bytes(), image.contentType());
        MediaRef variantMedia = mediaStore.saveImage(request.instanceId(), variantImage.bytes(), variantImage.contentType());
        attachMedia(generated, recognition, variantRecognition, media.url(), variantMedia.url());
        deriveAnswers(generated, recognition, variantRecognition);
        return validator.splitAndValidate(gameCode(), generated, client.modelName() + "+" + client.modelName());
    }

    private JsonNode normalizeScene(ObjectNode generated) {
        JsonNode rawSpec = generated.path("sceneSpec");
        JsonNode rawElements = rawSpec.path("elements");
        if (!rawSpec.isObject() || !rawElements.isArray() || rawElements.size() < 2) throw invalid();
        JsonNode rawPrimary = null;
        JsonNode rawSecondary = null;
        for (JsonNode element : rawElements) {
            if (rawPrimary == null && element.path("primary").asBoolean(false)) rawPrimary = element;
        }
        if (rawPrimary == null) rawPrimary = rawElements.get(0);
        for (JsonNode element : rawElements) {
            if (element != rawPrimary) {
                rawSecondary = element;
                break;
            }
        }
        if (rawSecondary == null) throw invalid();

        ObjectNode spec = objectMapper.createObjectNode();
        spec.put("imagePrompt", "原创儿童几何观察插画，两个彩色图形彼此分开，无文字。");
        ArrayNode elements = spec.putArray("elements");
        ObjectNode primary = normalizedElement(rawPrimary, "primary", true, 32, 62, 0);
        ObjectNode secondary = normalizedElement(rawSecondary, "detail", false, 72, 34, 1);
        if (primary.path("id").asText("").equals(secondary.path("id").asText(""))) secondary.put("id", "detail");
        primary.put("relation", "位于画面左下方");
        secondary.put("relation", "位于主体右上方");
        if (primary.path("color").asText("").equals(secondary.path("color").asText(""))) {
            secondary.put("color", alternativeColor(primary.path("color").asText("")));
            secondary.put("label", secondary.path("color").asText("") + secondary.path("shape").asText("") + "图形");
        }
        elements.add(primary);
        elements.add(secondary);
        generated.set("sceneSpec", spec);
        return spec;
    }

    private ObjectNode normalizedElement(JsonNode source, String fallbackId, boolean primary, int x, int y, int colorIndex) {
        ObjectNode element = objectMapper.createObjectNode();
        String id = source.path("id").asText("").trim();
        element.put("id", id.isBlank() ? fallbackId : id);
        String color = source.path("color").asText("").trim();
        if (color.isBlank()) color = colorIndex == 0 ? "深蓝色" : "亮黄色";
        String shape = normalizedShape(source.path("shape").asText(""));
        element.put("label", color + shape + (primary ? "主体" : "图形"));
        element.put("primary", primary);
        element.put("color", color);
        element.put("shape", shape);
        element.put("x", x);
        element.put("y", y);
        return element;
    }

    private static String normalizedShape(String value) {
        if (value.contains("三角")) return "三角形";
        if (value.contains("星")) return "星形";
        if (value.contains("方") || value.contains("矩")) return "方形";
        if (value.contains("椭圆")) return "椭圆形";
        return "圆形";
    }

    private JsonNode buildVariant(ObjectNode generated, JsonNode sceneSpec, String seed) {
        ObjectNode variant = (ObjectNode) sceneSpec.deepCopy();
        ArrayNode elements = (ArrayNode) variant.path("elements");
        int targetIndex = elements.size() > 1 ? 1 : 0;
        ObjectNode target = (ObjectNode) elements.get(targetIndex);
        String field = switch (Math.floorMod(seed.hashCode(), 4)) {
            case 1 -> "shape";
            case 2 -> "position";
            case 3 -> "relation";
            default -> "color";
        };
        String before;
        String after;
        if ("shape".equals(field)) {
            before = target.path("shape").asText("圆形");
            after = before.contains("三角") ? "圆形" : "三角形";
            target.put("shape", after);
        } else if ("position".equals(field)) {
            int oldX = clamp(target.path("x").asInt(50), 0, 100);
            int oldY = clamp(target.path("y").asInt(50), 0, 100);
            before = positionLabel(oldX, oldY);
            int newX = oldX >= 50 ? Math.max(8, oldX - 32) : Math.min(92, oldX + 32);
            target.put("x", newX);
            after = positionLabel(newX, oldY);
        } else if ("relation".equals(field)) {
            before = target.path("relation").asText("在主体旁边");
            after = before.contains("左") ? "在主体右侧" : "在主体左侧";
            target.put("relation", after);
        } else {
            before = target.path("color").asText("亮黄色");
            after = alternativeColor(before);
            target.put("color", after);
        }
        ObjectNode change = generated.putObject("change");
        change.put("elementId", target.path("id").asText(""));
        change.put("field", field);
        change.put("before", before);
        change.put("after", after);
        generated.set("variantSceneSpec", variant);
        return variant;
    }

    private void buildRounds(ObjectNode generated, JsonNode sceneSpec, JsonNode variantSceneSpec, JsonNode change) {
        JsonNode primary = null;
        JsonNode secondary = null;
        for (JsonNode element : sceneSpec.path("elements")) {
            if (element.path("primary").asBoolean(false)) primary = element;
            else if (secondary == null) secondary = element;
        }
        if (primary == null || secondary == null) throw invalid();
        generated.put("instruction", "观察本局画面，比较视觉模型的识别与颜色、形状、位置证据。");
        ObjectNode demo = generated.putObject("demo");
        demo.put("title", "主体观察示范");
        demo.put("explanation", "先找画面主体，再同时核对它的颜色、形状和位置，不能只凭一种线索。");

        ArrayNode rounds = generated.putArray("rounds");
        rounds.add(buildRound(
                "r1", "找出画面主体", "哪一项是画面中的主体？",
                primary, secondary, "element",
                primary.path("id").asText(""),
                "同时比较大小、位置和形状。",
                "主体是" + primary.path("label").asText("主要元素") + "，它位于" + positionLabel(primary.path("x").asInt(50), primary.path("y").asInt(50)) + "。"
        ));
        rounds.add(buildRound(
                "r2", "核对颜色和形状", "哪一项同时符合画面中的颜色和形状？",
                secondary, primary, "color-shape",
                secondary.path("id").asText(""),
                "颜色不是唯一线索，要和形状一起核对。",
                secondary.path("label").asText("这个元素") + "同时具有" + secondary.path("color").asText("") + "和" + secondary.path("shape").asText("") + "两条证据。"
        ));

        String changedId = change.path("elementId").asText("");
        JsonNode changedBefore = findElement(sceneSpec, changedId);
        JsonNode changedAfter = findElement(variantSceneSpec, changedId);
        if (changedBefore == null || changedAfter == null) throw invalid();
        ObjectNode third = rounds.addObject();
        third.put("roundId", "r3");
        third.put("title", "只改变一个信息");
        third.put("prompt", "对比改变前后，哪一项描述了唯一变化？");
        ArrayNode thirdOptions = third.putArray("options");
        thirdOptions.add(option("r3-good", change.path("before").asText("") + " → " + change.path("after").asText(""), changedId, change.path("after").asText(""), "change"));
        thirdOptions.add(option("r3-bad", "主体和数量都改变了", primary.path("id").asText(""), "multiple", "change"));
        third.set("answer", answer(changedId, change.path("after").asText(""), "change",
                "逐项比较颜色、形状、位置和关系。",
                "只有" + changedBefore.path("label").asText("目标元素") + "的" + change.path("field").asText("") + "发生变化。"));

        ObjectNode result = generated.putObject("result");
        String primaryLabel = primary.path("label").asText("主体");
        result.put("evidence", "我用" + primaryLabel + "的颜色、形状和位置核对了判断。");
        result.put("aiCorrect", "视觉模型能够识别画面中的主要元素和部分空间关系。");
        result.put("uncertain", "较小或相近的元素仍可能被视觉模型漏看。");
        result.put("change", "单独改变" + change.path("field").asText("") + "后，可以比较识别结果怎样变化。");
        result.put("discovery", "多个画面证据一起使用，比只看颜色更可靠。");
        result.put("limitation", "视觉模型的识别是观察线索，不等于绝对正确答案。");
    }

    private ObjectNode buildRound(
            String roundId,
            String title,
            String prompt,
            JsonNode correct,
            JsonNode distractor,
            String key,
            String targetValue,
            String hint,
            String feedback
    ) {
        ObjectNode round = objectMapper.createObjectNode();
        round.put("roundId", roundId);
        round.put("title", title);
        round.put("prompt", prompt);
        ArrayNode options = round.putArray("options");
        options.add(option(roundId + "-good", optionLabel(correct, key), correct.path("id").asText(""), targetValue, key));
        options.add(option(roundId + "-bad", optionLabel(distractor, key), distractor.path("id").asText(""), distractor.path("id").asText(""), key));
        round.set("answer", answer(correct.path("id").asText(""), targetValue, key, hint, feedback));
        return round;
    }

    private ObjectNode option(String id, String label, String elementId, String value, String key) {
        ObjectNode option = objectMapper.createObjectNode();
        option.put("id", id);
        option.put("label", label);
        option.put("elementId", elementId);
        option.put("value", value);
        option.put("key", key);
        return option;
    }

    private ObjectNode answer(String elementId, String value, String key, String hint, String feedback) {
        ObjectNode answer = objectMapper.createObjectNode();
        answer.put("targetElementId", elementId);
        answer.put("targetValue", value);
        answer.put("targetKey", key);
        answer.put("hint", hint);
        answer.put("feedback", feedback);
        answer.putObject("comparison");
        ObjectNode ability = answer.putObject("ability");
        ability.put("taskCompletion", 1);
        ability.put("evidenceUse", 1);
        ability.put("revisionQuality", 1);
        ability.put("explanationClarity", 1);
        return answer;
    }

    private static String optionLabel(JsonNode element, String key) {
        if ("color-shape".equals(key)) {
            return element.path("color").asText("") + " · " + element.path("shape").asText("");
        }
        return element.path("label").asText("画面元素");
    }

    private static JsonNode findElement(JsonNode sceneSpec, String id) {
        for (JsonNode element : sceneSpec.path("elements")) {
            if (id.equals(element.path("id").asText(""))) return element;
        }
        return null;
    }

    private static String alternativeColor(String before) {
        if (before.contains("蓝")) return "亮橙色";
        if (before.contains("橙") || before.contains("黄")) return "深蓝色";
        return "亮黄色";
    }

    private SinglePlayerAiClient.ImagePayload generateSceneImage(JsonNode sceneSpec) {
        try {
            return client.generateImage(compactImagePrompt(sceneSpec));
        } catch (GenerationFailure providerFailure) {
            return renderScene(sceneSpec);
        }
    }

    private SinglePlayerAiClient.ImagePayload renderScene(JsonNode sceneSpec) {
        BufferedImage image = new BufferedImage(512, 512, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setColor(new Color(247, 250, 252));
            graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
            int index = 0;
            for (JsonNode element : sceneSpec.path("elements")) {
                int x = 54 + clamp(element.path("x").asInt(50), 0, 100) * 404 / 100;
                int y = 54 + clamp(element.path("y").asInt(50), 0, 100) * 404 / 100;
                int size = element.path("primary").asBoolean(false) ? 104 : 72;
                Shape shape = shapeFor(element.path("shape").asText(""), x, y, size);
                graphics.setColor(new Color(31, 41, 55, 35));
                graphics.translate(5, 7);
                graphics.fill(shape);
                graphics.translate(-5, -7);
                graphics.setColor(colorFor(element.path("color").asText(""), index));
                graphics.fill(shape);
                graphics.setColor(new Color(45, 55, 72));
                graphics.setStroke(new BasicStroke(element.path("primary").asBoolean(false) ? 4f : 3f));
                graphics.draw(shape);
                index += 1;
            }
        } finally {
            graphics.dispose();
        }
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(image, "png", output);
            return new SinglePlayerAiClient.ImagePayload(output.toByteArray(), "image/png");
        } catch (IOException error) {
            throw new GenerationFailure("IMAGE_FALLBACK_FAILED", "图片后备绘制失败", "FAILED", false);
        }
    }

    private static Shape shapeFor(String shapeName, int centerX, int centerY, int size) {
        String name = shapeName == null ? "" : shapeName;
        double left = centerX - size / 2d;
        double top = centerY - size / 2d;
        if (name.contains("三角")) {
            Path2D triangle = new Path2D.Double();
            triangle.moveTo(centerX, top);
            triangle.lineTo(left + size, top + size);
            triangle.lineTo(left, top + size);
            triangle.closePath();
            return triangle;
        }
        if (name.contains("星")) {
            Path2D star = new Path2D.Double();
            for (int point = 0; point < 10; point += 1) {
                double radius = point % 2 == 0 ? size / 2d : size / 4.2d;
                double angle = -Math.PI / 2d + point * Math.PI / 5d;
                double x = centerX + Math.cos(angle) * radius;
                double y = centerY + Math.sin(angle) * radius;
                if (point == 0) star.moveTo(x, y); else star.lineTo(x, y);
            }
            star.closePath();
            return star;
        }
        if (name.contains("方") || name.contains("矩") || name.contains("盒") || name.contains("书")) {
            return new RoundRectangle2D.Double(left, top, size, size, 18, 18);
        }
        if (name.contains("椭圆")) {
            return new Ellipse2D.Double(left - size * 0.12d, top + size * 0.08d, size * 1.24d, size * 0.84d);
        }
        return new Ellipse2D.Double(left, top, size, size);
    }

    private static Color colorFor(String colorName, int index) {
        String name = colorName == null ? "" : colorName;
        if (name.contains("红")) return new Color(225, 83, 83);
        if (name.contains("橙")) return new Color(241, 139, 67);
        if (name.contains("黄")) return new Color(242, 196, 74);
        if (name.contains("绿")) return new Color(70, 166, 101);
        if (name.contains("青")) return new Color(47, 175, 180);
        if (name.contains("蓝")) return new Color(72, 118, 202);
        if (name.contains("紫")) return new Color(139, 96, 183);
        if (name.contains("粉")) return new Color(226, 126, 169);
        if (name.contains("棕") || name.contains("褐")) return new Color(151, 103, 67);
        if (name.contains("黑")) return new Color(64, 67, 74);
        if (name.contains("灰")) return new Color(143, 151, 161);
        Color[] fallback = {new Color(78, 142, 198), new Color(235, 160, 72), new Color(91, 173, 119)};
        return fallback[Math.floorMod(index, fallback.length)];
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private String compactImagePrompt(JsonNode sceneSpec) {
        StringBuilder prompt = new StringBuilder("原创方形儿童绘本插画，浅色纯净背景，元素清晰分开。");
        for (JsonNode element : sceneSpec.path("elements")) {
            prompt.append(element.path("primary").asBoolean(false) ? "主体：" : "元素：")
                    .append(clipped(element.path("label").asText(""), 28))
                    .append("，")
                    .append(clipped(element.path("color").asText(""), 18))
                    .append("，")
                    .append(clipped(element.path("shape").asText(""), 18))
                    .append("，位于")
                    .append(positionLabel(element.path("x").asInt(50), element.path("y").asInt(50)));
            String relation = clipped(element.path("relation").asText(""), 32);
            if (!relation.isBlank()) prompt.append("，").append(relation);
            prompt.append("。");
        }
        prompt.append("画面明亮、适合儿童观察，不含文字、水印、真实人物或版权角色。");
        return prompt.length() <= 600 ? prompt.toString() : prompt.substring(0, 540) + "。不含文字、水印或真实人物。";
    }

    private static String positionLabel(int x, int y) {
        String horizontal = x < 34 ? "左" : x > 66 ? "右" : "中";
        String vertical = y < 34 ? "上" : y > 66 ? "下" : "部";
        return "中".equals(horizontal) && "部".equals(vertical) ? "画面中央" : "画面" + horizontal + vertical;
    }

    private static String clipped(String value, int maxLength) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
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

    private void validateSingleChange(JsonNode original, JsonNode variant, JsonNode declared) {
        if (!declared.isObject()) throw invalid();
        Map<String, JsonNode> originalById = new HashMap<>();
        original.path("elements").forEach(element -> originalById.put(element.path("id").asText(""), element));
        if (originalById.size() != variant.path("elements").size()) throw invalid();
        int changes = 0;
        String changedElement = "";
        String changedField = "";
        for (JsonNode next : variant.path("elements")) {
            String id = next.path("id").asText("");
            JsonNode before = originalById.get(id);
            if (before == null || before.path("primary").asBoolean() != next.path("primary").asBoolean()) throw invalid();
            for (String field : Set.of("color", "shape", "relation")) {
                if (!before.path(field).equals(next.path(field))) {
                    changes += 1;
                    changedElement = id;
                    changedField = field;
                }
            }
            if (!before.path("x").equals(next.path("x")) || !before.path("y").equals(next.path("y"))) {
                changes += 1;
                changedElement = id;
                changedField = "position";
            }
        }
        if (changes != 1
                || !changedElement.equals(declared.path("elementId").asText(""))
                || !changedField.equals(declared.path("field").asText(""))) throw invalid();
    }

    private void attachMedia(
            JsonNode generated,
            JsonNode recognition,
            JsonNode variantRecognition,
            String imageUrl,
            String variantImageUrl
    ) {
        ObjectNode mutable = (ObjectNode) generated;
        mutable.put("imageUrl", imageUrl);
        mutable.put("altText", recognition.path("altText").asText());
        mutable.set("aiDetected", recognition.path("detections").deepCopy());
        mutable.put("variantImageUrl", variantImageUrl);
        mutable.put("variantAltText", variantRecognition.path("altText").asText());
        mutable.set("variantAiDetected", variantRecognition.path("detections").deepCopy());
        attach(generated.path("demo"), imageUrl, recognition.path("altText").asText());
        for (int index = 0; index < generated.path("rounds").size(); index += 1) {
            JsonNode round = generated.path("rounds").path(index);
            attach(round, imageUrl, recognition.path("altText").asText());
            if (index == 2 && round.isObject()) {
                ObjectNode mutableRound = (ObjectNode) round;
                mutableRound.put("beforeImageUrl", imageUrl);
                mutableRound.put("beforeAltText", recognition.path("altText").asText());
                mutableRound.put("afterImageUrl", variantImageUrl);
                mutableRound.put("afterAltText", variantRecognition.path("altText").asText());
            }
        }
    }

    private static void attach(JsonNode node, String imageUrl, String altText) {
        if (node.isObject()) {
            ((ObjectNode) node).put("imageUrl", imageUrl);
            ((ObjectNode) node).put("altText", altText);
        }
    }

    private void deriveAnswers(JsonNode generated, JsonNode recognition, JsonNode variantRecognition) {
        for (JsonNode round : generated.path("rounds")) {
            JsonNode answer = round.path("answer");
            if (!answer.isObject()) throw invalid();
            String targetElement = answer.path("targetElementId").asText("");
            String targetValue = answer.path("targetValue").asText("");
            String targetKey = answer.path("targetKey").asText("");
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
