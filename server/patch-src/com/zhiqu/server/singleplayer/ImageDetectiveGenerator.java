package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.Evaluation;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GeneratedGame;
import com.zhiqu.server.singleplayer.SinglePlayerGameGenerator.GenerationRequest;
import com.zhiqu.server.singleplayer.SinglePlayerMediaStore.MediaRef;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
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
            你为 6-12 岁儿童实时设计“图片侦探”的原创生活观察场景，另一个视觉模型会核验图片。
            每局必须重新构思具体目标，不从固定题库、固定场景列表或固定生成模板中轮换。不要使用圆形、三角形、颜色配对或方向术语作为题目。
            场景来自儿童能理解的真实日常活动、物品用途或公共环境，但不要照抄任何示例。目标必须是一句明确、可被图片判断的生活描述。
            图片中要有：目标主体、一个能显著支持目标识别的关键元素，以及两个对目标识别影响很小的干扰元素。三个元素必须在用途、类别、外形和画面位置上明显不同，不能是同类餐具、同类文具或近义物品。元素要彼此分开，方便按矩形遮罩删除。
            禁止真实人物身份、学校住址、版权角色、在世艺术家风格、文字水印、危险、恐怖或歧视内容。
            只返回 JSON：
            {
              "safety":{"status":"SAFE","reason":"适龄且无危险内容"},
              "sceneSpec":{
                "target":{"id":"稳定英文ID","label":"明确识别目标","recognitionPrompt":"让视觉模型判断什么"},
                "imagePrompt":"完整的原创儿童生活场景插画描述，明确每个可删除元素的位置，画面内不含文字",
                "elements":[
                  {"id":"稳定英文ID","label":"儿童可读名称","role":"CRITICAL|IRRELEVANT","category":"物品类别","purpose":"在场景中的明确用途","visualTrait":"一眼可分辨的外形或材质特征","bbox":{"x":0到84,"y":0到84,"width":12到36,"height":12到36}}
                ]
              }
            }
            elements 必须只提供 3 个可删除元素，必须一个 CRITICAL、两个 IRRELEVANT；bbox 是元素在 100x100 画布中的外接矩形，元素之间不要重叠。
            三个元素的 category、purpose 和 visualTrait 必须各不相同，不能把三个候选写成同类物品或近义功能；这三项会直接展示给儿童用于比较。
            CRITICAL 删除后应使目标判断消失或明显不确定；两个 IRRELEVANT 删除后不应改变目标判断。只返回 JSON，不要 Markdown。
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

        JsonNode raw = client.generateJson(SYSTEM_PROMPT, context);
        ObjectNode sceneSpec = normalizeScene(raw.path("sceneSpec"), request.ageBand());
        validateScene(sceneSpec);

        SinglePlayerAiClient.ImagePayload completeImage = client.generateImage(compactImagePrompt(sceneSpec));
        BufferedImage completeRaster = decodeImage(completeImage);
        JsonNode completeRecognition = normalizeRecognition(
                client.analyzeImage(visionPayload(completeRaster), analysisSpec(sceneSpec, Set.copyOf(allElementIds(sceneSpec)))), sceneSpec);
        alignElementBoxes(sceneSpec, completeRecognition);
        validateScene(sceneSpec);
        validator.validateImageConsistency(sceneSpec, completeRecognition);

        List<SinglePlayerAiClient.VisionCase> visionCases = new ArrayList<>();
        Map<String, BufferedImage> removedRasters = new LinkedHashMap<>();
        Map<String, SinglePlayerAiClient.ImagePayload> cardImages = new LinkedHashMap<>();
        for (String elementId : allElementIds(sceneSpec)) {
            JsonNode element = findElement(sceneSpec, elementId);
            if (element == null) throw invalid("IMAGE_ELEMENT_MISSING");
            BufferedImage removedRaster = removeElements(completeRaster, sceneSpec, List.of(elementId));
            removedRasters.put(elementId, removedRaster);
            cardImages.put(elementId, pngPayload(cropElement(completeRaster, element.path("bbox"))));
            visionCases.add(new SinglePlayerAiClient.VisionCase(
                    "remove-" + elementId,
                    visionPayload(removedRaster),
                    analysisSpec(sceneSpec, visibleAfterRemoval(sceneSpec, List.of(elementId)))));
        }
        Map<String, JsonNode> recognitions = client.analyzeImages(visionCases);

        Map<String, Trial> trials = new LinkedHashMap<>();
        for (String elementId : allElementIds(sceneSpec)) {
            JsonNode element = findElement(sceneSpec, elementId);
            if (element == null) throw invalid("IMAGE_ELEMENT_MISSING");
            JsonNode removedRecognition = normalizeRecognition(recognitions.get("remove-" + elementId), sceneSpec);
            validator.validateImageRecognition(sceneSpec, removedRecognition);
            SinglePlayerAiClient.ImagePayload cardImage = cardImages.get(elementId);
            MediaRef cardMedia = mediaStore.saveImage(request.instanceId(), cardImage.bytes(), cardImage.contentType());
            double impact = targetScore(completeRecognition) - targetScore(removedRecognition);
            trials.put(elementId, new Trial(element, cardMedia, removedRecognition, impact));
        }

        ImpactSelection impact = selectVerifiedImpact(trials);
        Trial critical = trials.get(impact.criticalId());
        if (critical == null) throw invalid("IMAGE_IMPACT_INVALID");
        BufferedImage missingRaster = removedRasters.get(impact.criticalId());
        if (missingRaster == null) throw invalid("IMAGE_ELEMENT_MISSING");
        SinglePlayerAiClient.ImagePayload missingImage = pngPayload(missingRaster);
        JsonNode missingRecognition = critical.recognition();
        MediaRef completeMedia = mediaStore.saveImage(request.instanceId(), completeImage.bytes(), completeImage.contentType());
        MediaRef missingMedia = mediaStore.saveImage(request.instanceId(), missingImage.bytes(), missingImage.contentType());
        ObjectNode generated = objectMapper.createObjectNode();
        generated.set("safety", raw.path("safety").deepCopy());
        generated.set("sceneSpec", publicSceneSpec(sceneSpec));
        attachPublicMedia(generated, completeRecognition, missingRecognition, completeMedia, missingMedia, trials);
        buildRounds(generated, sceneSpec, completeRecognition, missingRecognition, trials, impact, completeMedia, missingMedia);
        deriveAnswers(generated);
        return validator.splitAndValidate(gameCode(), generated, client.modelName() + "+vision-mask-v2");
    }

    @Override
    public Evaluation evaluate(JsonNode publicRound, JsonNode answer, JsonNode action) {
        Set<String> selected = stringValues(action.path("selectedIds"));
        Set<String> accepted = stringValues(answer.path("acceptedOptionIds"));
        boolean correct = selected.equals(accepted);
        JsonNode comparison = answer.path("comparison");
        if (selected.size() == 1 && answer.path("trialComparisons").isObject()) {
            String selectedId = selected.iterator().next();
            JsonNode selectedComparison = answer.path("trialComparisons").path(selectedId);
            if (selectedComparison.isObject()) comparison = selectedComparison;
        }
        return new Evaluation(
                correct,
                correct ? "" : answer.path("hint").asText(""),
                correct ? answer.path("feedback").asText("") : "",
                comparison,
                answer.path("ability")
        );
    }

    private ObjectNode normalizeScene(JsonNode rawSpec, String ageBand) {
        if (!rawSpec.isObject()) throw invalid("IMAGE_SCENE_INVALID");
        JsonNode rawTarget = rawSpec.path("target");
        String targetLabel = clipped(rawTarget.path("label").asText(""), 80);
        if (targetLabel.isBlank()) targetLabel = clipped(rawSpec.path("targetLabel").asText(""), 80);
        if (targetLabel.isBlank()) throw invalid("IMAGE_TARGET_INVALID");

        ObjectNode spec = objectMapper.createObjectNode();
        ObjectNode target = spec.putObject("target");
        target.put("id", safeId(rawTarget.path("id").asText(""), "target"));
        target.put("label", targetLabel);
        String recognitionPrompt = clipped(rawTarget.path("recognitionPrompt").asText(""), 120);
        target.put("recognitionPrompt", recognitionPrompt.isBlank() ? "判断画面是否清楚表达“" + targetLabel + "”" : recognitionPrompt);

        String imagePrompt = clipped(rawSpec.path("imagePrompt").asText(""), 1600);
        if (imagePrompt.isBlank()) throw invalid("IMAGE_PROMPT_INVALID");
        spec.put("imagePrompt", imagePrompt);

        JsonNode rawElements = rawSpec.path("elements");
        if (!rawElements.isArray() || rawElements.size() < 3) throw invalid("IMAGE_ELEMENTS_INVALID");
        int maximum = 3;
        ArrayNode elements = spec.putArray("elements");
        Set<String> ids = new HashSet<>();
        int index = 0;
        for (JsonNode rawElement : rawElements) {
            if (elements.size() >= maximum) break;
            String label = clipped(rawElement.path("label").asText(""), 50);
            if (label.isBlank()) continue;
            ObjectNode element = elements.addObject();
            String id = safeId(rawElement.path("id").asText(""), "element-" + (index + 1));
            while (!ids.add(id)) id = id + "-" + (index + 1);
            element.put("id", id);
            element.put("label", label);
            element.put("role", normalizedRole(rawElement.path("role").asText(""), index));
            String category = clipped(rawElement.path("category").asText(""), 24);
            String purpose = clipped(rawElement.path("purpose").asText(""), 36);
            String visualTrait = clipped(rawElement.path("visualTrait").asText(""), 36);
            if (category.isBlank() || purpose.isBlank() || visualTrait.isBlank()) {
                throw invalid("IMAGE_ELEMENT_CONTRAST_INVALID");
            }
            element.put("category", category);
            element.put("purpose", purpose);
            element.put("visualTrait", visualTrait);
            element.put("removable", true);
            element.set("bbox", normalizedBox(rawElement.path("bbox"), index));
            ObjectNode position = element.putObject("restorePosition");
            position.put("x", element.path("bbox").path("x").asInt() + element.path("bbox").path("width").asInt() / 2);
            position.put("y", element.path("bbox").path("y").asInt() + element.path("bbox").path("height").asInt() / 2);
            index += 1;
        }
        if (elements.size() != 3) throw invalid("IMAGE_ELEMENTS_INVALID");
        ensureContrastingRoles(elements);
        return spec;
    }

    private ObjectNode normalizedBox(JsonNode raw, int index) {
        int fallbackX = switch (index) {
            case 0 -> 12;
            case 1 -> 64;
            case 2 -> 58;
            default -> 16;
        };
        int fallbackY = switch (index) {
            case 0 -> 58;
            case 1 -> 14;
            case 2 -> 62;
            default -> 16;
        };
        int width = clamp(raw.path("width").asInt(24), 12, 36);
        int height = clamp(raw.path("height").asInt(24), 12, 36);
        ObjectNode box = objectMapper.createObjectNode();
        box.put("x", clamp(raw.path("x").asInt(fallbackX), 0, 100 - width));
        box.put("y", clamp(raw.path("y").asInt(fallbackY), 0, 100 - height));
        box.put("width", width);
        box.put("height", height);
        return box;
    }

    private static String normalizedRole(String value, int index) {
        String role = value == null ? "" : value.trim().toUpperCase();
        if ("CRITICAL".equals(role)) return role;
        return index == 0 ? "CRITICAL" : "IRRELEVANT";
    }

    private static void ensureContrastingRoles(ArrayNode elements) {
        int criticalIndex = -1;
        for (int index = 0; index < elements.size(); index += 1) {
            if (criticalIndex < 0 && "CRITICAL".equals(elements.get(index).path("role").asText(""))) criticalIndex = index;
        }
        if (criticalIndex < 0) criticalIndex = 0;
        for (int index = 0; index < elements.size(); index += 1) {
            ((ObjectNode) elements.get(index)).put("role", index == criticalIndex ? "CRITICAL" : "IRRELEVANT");
        }
    }

    private void validateScene(JsonNode sceneSpec) {
        String target = sceneSpec.path("target").path("label").asText("");
        String prompt = sceneSpec.path("imagePrompt").asText("");
        JsonNode elements = sceneSpec.path("elements");
        if (target.isBlank() || prompt.isBlank() || target.contains("图形") || prompt.contains("几何图形")
                || !elements.isArray() || elements.size() != 3) throw invalid("IMAGE_SCENE_INVALID");
        Set<String> ids = new HashSet<>();
        Set<String> categories = new HashSet<>();
        Set<String> purposes = new HashSet<>();
        Set<String> visualTraits = new HashSet<>();
        for (JsonNode element : elements) {
            if (!ids.add(element.path("id").asText("")) || element.path("label").asText("").isBlank()) {
                throw invalid("IMAGE_ELEMENT_INVALID");
            }
            if (!categories.add(contrastKey(element.path("category").asText("")))
                    || !purposes.add(contrastKey(element.path("purpose").asText("")))
                    || !visualTraits.add(contrastKey(element.path("visualTrait").asText("")))) {
                throw invalid("IMAGE_ELEMENT_CONTRAST_INVALID");
            }
            JsonNode box = element.path("bbox");
            int x = box.path("x").asInt(-1);
            int y = box.path("y").asInt(-1);
            int width = box.path("width").asInt(-1);
            int height = box.path("height").asInt(-1);
            if (x < 0 || y < 0 || width < 8 || height < 8 || x + width > 100 || y + height > 100) {
                throw invalid("IMAGE_ELEMENT_BOUNDS_INVALID");
            }
        }
        for (int first = 0; first < elements.size(); first += 1) {
            for (int second = first + 1; second < elements.size(); second += 1) {
                if (rectanglesOverlap(elements.get(first).path("bbox"), elements.get(second).path("bbox"))) {
                    throw invalid("IMAGE_ELEMENT_OVERLAP_INVALID");
                }
            }
        }
    }

    private static String contrastKey(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").trim();
    }

    private static boolean rectanglesOverlap(JsonNode first, JsonNode second) {
        int firstLeft = first.path("x").asInt();
        int firstTop = first.path("y").asInt();
        int firstRight = firstLeft + first.path("width").asInt();
        int firstBottom = firstTop + first.path("height").asInt();
        int secondLeft = second.path("x").asInt();
        int secondTop = second.path("y").asInt();
        int secondRight = secondLeft + second.path("width").asInt();
        int secondBottom = secondTop + second.path("height").asInt();
        return firstLeft < secondRight && secondLeft < firstRight
                && firstTop < secondBottom && secondTop < firstBottom;
    }

    private String compactImagePrompt(JsonNode sceneSpec) {
        StringBuilder prompt = new StringBuilder();
        prompt.append("原创方形儿童生活场景插画，清晰明亮，适合6到12岁儿童观察。目标场景：")
                .append(clipped(sceneSpec.path("target").path("label").asText(""), 80)).append("。")
                .append(clipped(sceneSpec.path("imagePrompt").asText(""), 850)).append("。")
                .append("以下物品必须清晰、彼此分开并出现在指定区域：");
        for (JsonNode element : sceneSpec.path("elements")) {
            JsonNode box = element.path("bbox");
            prompt.append(clipped(element.path("label").asText(""), 36))
                    .append("位于画面")
                    .append(positionLabel(box.path("x").asInt() + box.path("width").asInt() / 2,
                            box.path("y").asInt() + box.path("height").asInt() / 2)).append("；");
        }
        prompt.append("构图稳定，主体完整，不含文字、字母、数字、水印、标志、真实身份或版权角色。背景简洁，物品周围留出可编辑空间。");
        return prompt.length() <= 1400 ? prompt.toString() : prompt.substring(0, 1320) + "。画面不含文字或水印。";
    }

    private ObjectNode analysisSpec(JsonNode sceneSpec, Set<String> visibleIds) {
        ObjectNode analysis = objectMapper.createObjectNode();
        analysis.set("target", sceneSpec.path("target").deepCopy());
        ArrayNode elements = analysis.putArray("elements");
        for (JsonNode source : sceneSpec.path("elements")) {
            ObjectNode element = elements.addObject();
            element.put("id", source.path("id").asText(""));
            element.put("label", source.path("label").asText(""));
            element.set("bbox", source.path("bbox").deepCopy());
            element.put("visible", visibleIds.contains(source.path("id").asText("")));
        }
        return analysis;
    }

    private JsonNode normalizeRecognition(JsonNode raw, JsonNode sceneSpec) {
        if (!raw.isObject()) throw invalid("IMAGE_RECOGNITION_INVALID");
        ObjectNode normalized = (ObjectNode) raw.deepCopy();
        if (!normalized.path("detections").isArray()) normalized.putArray("detections");
        JsonNode targetRecognition = normalized.path("targetRecognition");
        if (!targetRecognition.isObject()) {
            ObjectNode target = normalized.putObject("targetRecognition");
            String targetId = sceneSpec.path("target").path("id").asText("");
            double confidence = 0d;
            boolean detected = false;
            for (JsonNode detection : normalized.path("detections")) {
                if (targetId.equals(detection.path("sceneElementId").asText(""))) {
                    confidence = detection.path("confidence").asDouble(0d);
                    detected = confidence >= 0.45d;
                }
            }
            target.put("targetLabel", sceneSpec.path("target").path("label").asText(""));
            target.put("detected", detected);
            target.put("confidence", confidence);
            target.put("description", normalized.path("altText").asText("视觉模型没有给出明确的目标判断"));
        } else {
            ObjectNode target = (ObjectNode) targetRecognition;
            if (target.path("targetLabel").asText("").isBlank()) {
                target.put("targetLabel", sceneSpec.path("target").path("label").asText(""));
            }
            if (target.path("description").asText("").isBlank()) {
                target.put("description", normalized.path("altText").asText("视觉模型没有给出明确描述"));
            }
        }
        return normalized;
    }

    private void alignElementBoxes(ObjectNode sceneSpec, JsonNode recognition) {
        for (JsonNode detection : recognition.path("detections")) {
            String id = detection.path("sceneElementId").asText("");
            JsonNode sourceBox = detection.path("bbox");
            JsonNode element = findElement(sceneSpec, id);
            if (element == null || !sourceBox.isObject()) continue;
            int x = sourceBox.path("x").asInt(-1);
            int y = sourceBox.path("y").asInt(-1);
            int width = sourceBox.path("width").asInt(-1);
            int height = sourceBox.path("height").asInt(-1);
            if (x < 0 || y < 0 || width < 8 || height < 8 || x + width > 100 || y + height > 100) continue;
            ((ObjectNode) element).set("bbox", normalizedBox(sourceBox, 0));
            ObjectNode position = ((ObjectNode) element).putObject("restorePosition");
            position.put("x", x + width / 2);
            position.put("y", y + height / 2);
        }
    }

    private ImpactSelection selectVerifiedImpact(Map<String, Trial> trials) {
        Trial high = null;
        Trial low = null;
        for (Trial trial : trials.values()) {
            if (high == null || trial.impact() > high.impact()) high = trial;
            if (low == null || trial.impact() < low.impact()) low = trial;
        }
        if (high == null || low == null || high == low
                || high.impact() < 0.05d
                || high.impact() - low.impact() < 0.05d) {
            throw new GenerationFailure(
                    "IMAGE_IMPACT_NOT_VERIFIED", "候选元素没有形成可验证的识别差异", "REJECTED", true);
        }
        return new ImpactSelection(high.element().path("id").asText(""), low.element().path("id").asText(""));
    }

    private void attachPublicMedia(
            ObjectNode generated,
            JsonNode completeRecognition,
            JsonNode missingRecognition,
            MediaRef completeMedia,
            MediaRef missingMedia,
            Map<String, Trial> trials
    ) {
        generated.put("completeImageUrl", completeMedia.url());
        generated.put("missingImageUrl", missingMedia.url());
        generated.put("completeAltText", completeRecognition.path("altText").asText("完整图片"));
        generated.put("missingAltText", missingRecognition.path("altText").asText("缺失图片"));
        generated.set("completeRecognition", publicRecognition(completeRecognition));
        generated.set("missingRecognition", publicRecognition(missingRecognition));
        generated.put("imageUrl", completeMedia.url());
        generated.put("variantImageUrl", missingMedia.url());
        generated.put("altText", completeRecognition.path("altText").asText("完整图片"));
        generated.put("variantAltText", missingRecognition.path("altText").asText("缺失图片"));
        ArrayNode candidates = generated.putArray("candidateElements");
        for (Trial trial : trials.values()) {
            ObjectNode candidate = candidates.addObject();
            candidate.put("id", trial.element().path("id").asText(""));
            candidate.put("label", trial.element().path("label").asText(""));
            candidate.put("category", trial.element().path("category").asText(""));
            candidate.put("purpose", trial.element().path("purpose").asText(""));
            candidate.put("visualTrait", trial.element().path("visualTrait").asText(""));
            candidate.put("imageUrl", trial.cardMedia().url());
            candidate.set("restorePosition", trial.element().path("restorePosition").deepCopy());
        }
    }

    private void buildRounds(
            ObjectNode generated,
            JsonNode sceneSpec,
            JsonNode completeRecognition,
            JsonNode missingRecognition,
            Map<String, Trial> trials,
            ImpactSelection impact,
            MediaRef completeMedia,
            MediaRef missingMedia
    ) {
        String targetLabel = sceneSpec.path("target").path("label").asText("本局目标");
        Trial critical = trials.get(impact.criticalId());
        Trial irrelevant = trials.get(impact.irrelevantId());
        if (critical == null || irrelevant == null) throw invalid("IMAGE_IMPACT_INVALID");
        String criticalLabel = critical.element().path("label").asText("关键元素");
        String irrelevantLabel = irrelevant.element().path("label").asText("装饰元素");

        generated.put("instruction", "左右对照完整图和缺失图，找出真正消失、并最能帮助 AI 识别“" + targetLabel + "”的元素。");
        ArrayNode rounds = generated.putArray("rounds");
        ObjectNode round = rounds.addObject();
        round.put("roundId", "r1");
        round.put("title", "找出 AI 识别的关键元素");
        round.put("prompt", "完整图中少了什么？从下面三个差异明显的元素里，选出最影响 AI 判断“" + targetLabel + "”的一个。");
        attachComparisonMedia(round, completeMedia, missingMedia, completeRecognition, missingRecognition, "完整图", "缺失图");
        ArrayNode options = round.putArray("options");
        for (Trial trial : trials.values()) {
            String elementId = trial.element().path("id").asText("");
            ObjectNode option = option("r1-" + elementId, trial.element().path("label").asText("候选元素"), elementId);
            JsonNode position = trial.element().path("restorePosition");
            option.put("description", trial.element().path("category").asText("物品") + " · "
                    + trial.element().path("purpose").asText("观察画面") + " · "
                    + positionLabel(position.path("x").asInt(), position.path("y").asInt()));
            option.put("imageUrl", trial.cardMedia().url());
            options.add(option);
        }
        round.set("answer", answer(
                "r1-" + impact.criticalId(),
                "先找左右两图中真正消失的物品，再想它是否直接说明了目标的用途、动作或身份。",
                "你找到了“" + criticalLabel + "”。删除它后，AI 对“" + targetLabel + "”的判断明显变弱。",
                comparison(completeRecognition, missingRecognition, "完整图", "缺失图")
        ));

        ObjectNode result = generated.putObject("result");
        result.put("evidence", "完整图中 AI 判断“" + recognitionDescription(completeRecognition) + "”，删除元素后变为“" + recognitionDescription(missingRecognition) + "”。");
        result.put("aiCorrect", "删除“" + criticalLabel + "”后，AI 对“" + targetLabel + "”的判断明显变弱。");
        result.put("uncertain", "删除“" + irrelevantLabel + "”时，AI 的目标判断没有出现同等程度的变化。");
        result.put("change", "完整图和缺失图只改变了“" + criticalLabel + "”这一处，便于直接比较。");
        result.put("discovery", "这个模型在本次识别中更依赖“" + criticalLabel + "”，而“" + irrelevantLabel + "”主要补充画面细节。");
        result.put("limitation", "这是这个模型对本局图片的实际结果，不表示所有 AI 在所有图片中永远依赖相同线索。");
    }

    private ObjectNode publicSceneSpec(JsonNode sceneSpec) {
        ObjectNode result = objectMapper.createObjectNode();
        result.set("target", sceneSpec.path("target").deepCopy());
        ArrayNode elements = result.putArray("elements");
        for (JsonNode source : sceneSpec.path("elements")) {
            ObjectNode element = elements.addObject();
            element.put("id", source.path("id").asText(""));
            element.put("label", source.path("label").asText(""));
            element.put("category", source.path("category").asText(""));
            element.put("purpose", source.path("purpose").asText(""));
            element.put("visualTrait", source.path("visualTrait").asText(""));
            element.set("restorePosition", source.path("restorePosition").deepCopy());
        }
        return result;
    }

    private ObjectNode publicRecognition(JsonNode recognition) {
        ObjectNode result = objectMapper.createObjectNode();
        result.set("targetRecognition", recognition.path("targetRecognition").deepCopy());
        result.set("detections", recognition.path("detections").deepCopy());
        result.put("altText", recognition.path("altText").asText(""));
        return result;
    }

    private void attachComparisonMedia(
            ObjectNode round,
            MediaRef before,
            MediaRef after,
            JsonNode beforeRecognition,
            JsonNode afterRecognition,
            String beforeLabel,
            String afterLabel
    ) {
        round.put("beforeImageUrl", before.url());
        round.put("afterImageUrl", after.url());
        round.put("beforeAltText", beforeRecognition.path("altText").asText(beforeLabel));
        round.put("afterAltText", afterRecognition.path("altText").asText(afterLabel));
        round.put("beforeLabel", beforeLabel);
        round.put("afterLabel", afterLabel);
        round.set("beforeRecognition", publicRecognition(beforeRecognition));
        round.set("afterRecognition", publicRecognition(afterRecognition));
    }

    private ObjectNode option(String id, String label, String value) {
        ObjectNode option = objectMapper.createObjectNode();
        option.put("id", id);
        option.put("label", label);
        option.put("value", value);
        return option;
    }

    private ObjectNode answer(String acceptedOptionId, String hint, String feedback, JsonNode comparison) {
        ObjectNode answer = objectMapper.createObjectNode();
        answer.put("targetOptionId", acceptedOptionId);
        answer.put("hint", hint);
        answer.put("feedback", feedback);
        answer.set("comparison", comparison);
        ObjectNode ability = answer.putObject("ability");
        ability.put("taskCompletion", 1);
        ability.put("evidenceUse", 1);
        ability.put("revisionQuality", 1);
        ability.put("explanationClarity", 1);
        return answer;
    }

    private ObjectNode comparison(JsonNode before, JsonNode after, String beforeLabel, String afterLabel) {
        ObjectNode comparison = objectMapper.createObjectNode();
        comparison.put(beforeLabel, recognitionDescription(before));
        comparison.put(afterLabel, recognitionDescription(after));
        return comparison;
    }

    private void deriveAnswers(ObjectNode generated) {
        for (JsonNode round : generated.path("rounds")) {
            JsonNode answer = round.path("answer");
            String targetOptionId = answer.path("targetOptionId").asText("");
            boolean present = false;
            for (JsonNode option : round.path("options")) {
                if (targetOptionId.equals(option.path("id").asText(""))) present = true;
            }
            if (!present) throw invalid("IMAGE_ANSWER_INVALID");
            ObjectNode mutable = (ObjectNode) answer;
            ArrayNode accepted = mutable.putArray("acceptedOptionIds");
            accepted.add(targetOptionId);
            mutable.put("mode", "EXACT");
            mutable.remove("targetOptionId");
        }
    }

    private BufferedImage decodeImage(SinglePlayerAiClient.ImagePayload payload) {
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(payload.bytes()));
            if (image == null || image.getWidth() < 64 || image.getHeight() < 64) throw invalid("IMAGE_RESOURCE_INVALID");
            BufferedImage rgb = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB);
            Graphics2D graphics = rgb.createGraphics();
            try {
                graphics.drawImage(image, 0, 0, null);
            } finally {
                graphics.dispose();
            }
            return rgb;
        } catch (IOException error) {
            throw invalid("IMAGE_RESOURCE_INVALID");
        }
    }

    private SinglePlayerAiClient.ImagePayload pngPayload(BufferedImage image) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(image, "png", output);
            return new SinglePlayerAiClient.ImagePayload(output.toByteArray(), "image/png");
        } catch (IOException error) {
            throw invalid("IMAGE_PROCESSING_FAILED");
        }
    }

    private SinglePlayerAiClient.ImagePayload visionPayload(BufferedImage source) {
        int maxDimension = 512;
        double scale = Math.min(1d, (double) maxDimension / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = resized.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_SPEED);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(resized, "jpg", output);
            return new SinglePlayerAiClient.ImagePayload(output.toByteArray(), "image/jpeg");
        } catch (IOException error) {
            throw invalid("IMAGE_PROCESSING_FAILED");
        }
    }

    private BufferedImage removeElements(BufferedImage source, JsonNode sceneSpec, List<String> removalIds) {
        BufferedImage result = copyImage(source);
        for (String id : removalIds) {
            JsonNode element = findElement(sceneSpec, id);
            if (element == null) throw invalid("IMAGE_ELEMENT_MISSING");
            fillRemovalArea(result, source, pixelBox(source, element.path("bbox")));
        }
        return result;
    }

    private void fillRemovalArea(BufferedImage target, BufferedImage source, PixelBox box) {
        int padding = Math.max(3, Math.min(source.getWidth(), source.getHeight()) / 100);
        PixelBox removalBox = expandBox(source, box, padding);
        int leftX = Math.max(0, removalBox.x() - 1);
        int rightX = Math.min(source.getWidth() - 1, removalBox.x() + removalBox.width());
        int topY = Math.max(0, removalBox.y() - 1);
        int bottomY = Math.min(source.getHeight() - 1, removalBox.y() + removalBox.height());
        for (int y = removalBox.y(); y < removalBox.y() + removalBox.height(); y++) {
            double verticalRatio = removalBox.height() <= 1 ? 0.5d
                    : (double) (y - removalBox.y()) / (removalBox.height() - 1);
            for (int x = removalBox.x(); x < removalBox.x() + removalBox.width(); x++) {
                double horizontalRatio = removalBox.width() <= 1 ? 0.5d
                        : (double) (x - removalBox.x()) / (removalBox.width() - 1);
                Color horizontal = blend(
                        new Color(source.getRGB(leftX, y), true),
                        new Color(source.getRGB(rightX, y), true),
                        horizontalRatio);
                Color vertical = blend(
                        new Color(source.getRGB(x, topY), true),
                        new Color(source.getRGB(x, bottomY), true),
                        verticalRatio);
                target.setRGB(x, y, blend(horizontal, vertical, 0.5d).getRGB());
            }
        }
    }

    private static Color blend(Color first, Color second, double ratio) {
        double amount = Math.max(0d, Math.min(1d, ratio));
        double remaining = 1d - amount;
        return new Color(
                (int) Math.round(first.getRed() * remaining + second.getRed() * amount),
                (int) Math.round(first.getGreen() * remaining + second.getGreen() * amount),
                (int) Math.round(first.getBlue() * remaining + second.getBlue() * amount),
                (int) Math.round(first.getAlpha() * remaining + second.getAlpha() * amount));
    }

    private BufferedImage cropElement(BufferedImage source, JsonNode bbox) {
        PixelBox box = pixelBox(source, bbox);
        int padding = Math.max(4, Math.min(source.getWidth(), source.getHeight()) / 80);
        int x = Math.max(0, box.x() - padding);
        int y = Math.max(0, box.y() - padding);
        int width = Math.min(source.getWidth() - x, box.width() + padding * 2);
        int height = Math.min(source.getHeight() - y, box.height() + padding * 2);
        BufferedImage crop = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = crop.createGraphics();
        try {
            graphics.drawImage(source, 0, 0, width, height, x, y, x + width, y + height, null);
        } finally {
            graphics.dispose();
        }
        return crop;
    }

    private static BufferedImage copyImage(BufferedImage source) {
        BufferedImage copy = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = copy.createGraphics();
        try {
            graphics.drawImage(source, 0, 0, null);
        } finally {
            graphics.dispose();
        }
        return copy;
    }

    private static PixelBox pixelBox(BufferedImage image, JsonNode bbox) {
        int x = clamp(bbox.path("x").asInt(), 0, 99) * image.getWidth() / 100;
        int y = clamp(bbox.path("y").asInt(), 0, 99) * image.getHeight() / 100;
        int width = Math.max(8, bbox.path("width").asInt(20) * image.getWidth() / 100);
        int height = Math.max(8, bbox.path("height").asInt(20) * image.getHeight() / 100);
        width = Math.min(width, image.getWidth() - x);
        height = Math.min(height, image.getHeight() - y);
        return new PixelBox(x, y, width, height);
    }

    private static PixelBox expandBox(BufferedImage image, PixelBox box, int padding) {
        int x = Math.max(0, box.x() - padding);
        int y = Math.max(0, box.y() - padding);
        int width = Math.min(image.getWidth() - x, box.width() + padding * 2);
        int height = Math.min(image.getHeight() - y, box.height() + padding * 2);
        return new PixelBox(x, y, width, height);
    }

    private static double targetScore(JsonNode recognition) {
        JsonNode target = recognition.path("targetRecognition");
        double confidence = Math.max(0d, Math.min(1d, target.path("confidence").asDouble(0d)));
        return target.path("detected").asBoolean(false) ? Math.max(0.55d, confidence) : Math.min(0.45d, confidence);
    }

    private static String recognitionDescription(JsonNode recognition) {
        JsonNode target = recognition.path("targetRecognition");
        String description = target.path("description").asText("").trim();
        if (!description.isBlank()) return clipped(description, 120);
        return target.path("detected").asBoolean(false) ? "能够识别本局目标" : "还不能确定本局目标";
    }

    private static JsonNode findElement(JsonNode sceneSpec, String id) {
        for (JsonNode element : sceneSpec.path("elements")) {
            if (id.equals(element.path("id").asText(""))) return element;
        }
        return null;
    }

    private static List<String> allElementIds(JsonNode sceneSpec) {
        List<String> ids = new ArrayList<>();
        for (JsonNode element : sceneSpec.path("elements")) ids.add(element.path("id").asText(""));
        return ids;
    }

    private static Set<String> visibleAfterRemoval(JsonNode sceneSpec, List<String> removalIds) {
        Set<String> visible = new HashSet<>(allElementIds(sceneSpec));
        visible.removeAll(removalIds);
        return visible;
    }

    private static Set<String> stringValues(JsonNode node) {
        Set<String> values = new HashSet<>();
        if (node != null && node.isArray()) {
            node.forEach(item -> {
                String value = item.asText("").trim();
                if (!value.isBlank()) values.add(value);
            });
        }
        return values;
    }

    private static String safeId(String value, String fallback) {
        String normalized = value == null ? "" : value.trim().replaceAll("[^A-Za-z0-9_-]", "-");
        normalized = normalized.replaceAll("-+", "-").replaceAll("^-|-$", "");
        return normalized.isBlank() ? fallback : normalized.substring(0, Math.min(48, normalized.length()));
    }

    private static String positionLabel(int x, int y) {
        String horizontal = x < 34 ? "左" : x > 66 ? "右" : "中";
        String vertical = y < 34 ? "上方" : y > 66 ? "下方" : "部";
        return "中".equals(horizontal) && "部".equals(vertical) ? "中央" : horizontal + vertical;
    }

    private static String clipped(String value, int maxLength) {
        String text = value == null ? "" : value.trim();
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static GenerationFailure invalid(String code) {
        return new GenerationFailure(code, "图片关卡结构未通过校验", "FAILED", true);
    }

    private record PixelBox(int x, int y, int width, int height) {
    }

    private record Trial(
            JsonNode element,
            MediaRef cardMedia,
            JsonNode recognition,
            double impact
    ) {
    }

    private record ImpactSelection(String criticalId, String irrelevantId) {
    }
}
