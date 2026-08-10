package com.zhiqu.server.singleplayer;

import com.zhiqu.server.singleplayer.SinglePlayerGameErrors.GenerationFailure;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
final class SinglePlayerAiClient {
    private static final int MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final Config config;

    @Autowired
    SinglePlayerAiClient(Environment environment, ObjectMapper objectMapper) {
        this(
                objectMapper,
                new Config(
                        value(environment, "DASHSCOPE_BASE_URL", "app.ai.base-url"),
                        value(environment, "DASHSCOPE_API_KEY", "app.ai.api-key"),
                        defaulted(value(environment, "DASHSCOPE_MODEL", "app.ai.model"), "qwen3.7-flash"),
                        value(environment, "MAGIC_IMAGE_BASE_URL", null),
                        value(environment, "MAGIC_IMAGE_API_KEY", null),
                        value(environment, "MAGIC_IMAGE_MODEL", null),
                        value(environment, "SINGLE_PLAYER_VISION_BASE_URL", null),
                        value(environment, "SINGLE_PLAYER_VISION_API_KEY", null),
                        value(environment, "SINGLE_PLAYER_VISION_MODEL", null),
                        Duration.ofSeconds(longValue(environment, "SINGLE_PLAYER_AI_TIMEOUT_SECONDS", 35, 1, 120))
                )
        );
    }

    SinglePlayerAiClient(ObjectMapper objectMapper, Config config) {
        this.objectMapper = objectMapper;
        this.config = config;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    }

    boolean textConfigured() {
        return complete(config.textBaseUrl(), config.textApiKey(), config.textModel());
    }

    boolean imageConfigured() {
        return complete(config.imageBaseUrl(), config.imageApiKey(), config.imageModel());
    }

    boolean visionConfigured() {
        return complete(config.visionBaseUrl(), config.visionApiKey(), config.visionModel());
    }

    void requireTextConfiguration() {
        if (!textConfigured()) {
            throw SinglePlayerGameErrors.unavailable(
                    "SINGLE_PLAYER_AI_NOT_CONFIGURED",
                    "AI 关卡尚未配置，请设置 DASHSCOPE_BASE_URL 和 DASHSCOPE_API_KEY"
            );
        }
    }

    void requireImageConfiguration() {
        requireTextConfiguration();
        if (!imageConfigured()) {
            throw SinglePlayerGameErrors.unavailable(
                    "SINGLE_PLAYER_IMAGE_NOT_CONFIGURED",
                    "图片关卡尚未配置，请设置 MAGIC_IMAGE_BASE_URL、MAGIC_IMAGE_API_KEY 和 MAGIC_IMAGE_MODEL"
            );
        }
        if (!visionConfigured()) {
            throw SinglePlayerGameErrors.unavailable(
                    "SINGLE_PLAYER_VISION_NOT_CONFIGURED",
                    "图片识别尚未配置，请设置 SINGLE_PLAYER_VISION_BASE_URL、SINGLE_PLAYER_VISION_API_KEY 和 SINGLE_PLAYER_VISION_MODEL"
            );
        }
    }

    String modelName() {
        return config.textModel();
    }

    JsonNode generateJson(String systemPrompt, JsonNode context) {
        requireTextConfiguration();
        return chatJson(config.textBaseUrl(), config.textApiKey(), config.textModel(), systemPrompt, context.toString(), null);
    }

    ImagePayload generateImage(String prompt) {
        if (!imageConfigured()) throw new GenerationFailure("IMAGE_AI_NOT_CONFIGURED", "图片模型未配置", "FAILED", false);
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", config.imageModel());
        payload.put("prompt", prompt);
        payload.put("n", 1);
        payload.put("size", "512x512");
        payload.put("quality", "low");
        Duration imageTimeout = Duration.ofSeconds(Math.min(12, config.timeout().toSeconds()));
        String response = sendJson(imageEndpoint(config.imageBaseUrl()), config.imageApiKey(), payload.toString(), 1, imageTimeout);
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode item = root.path("data").path(0);
            String base64 = item.path("b64_json").asText("").trim();
            if (!base64.isEmpty()) {
                byte[] bytes = Base64.getDecoder().decode(stripDataPrefix(base64));
                return new ImagePayload(bytes, detectContentType(bytes, "image/png"));
            }
            String url = item.path("url").asText("").trim();
            if (url.startsWith("data:")) {
                byte[] bytes = Base64.getDecoder().decode(stripDataPrefix(url));
                return new ImagePayload(bytes, detectContentType(bytes, dataContentType(url)));
            }
            if (!url.startsWith("https://") && !url.startsWith("http://")) throw invalid("IMAGE_RESPONSE_INVALID");
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(config.timeout()).GET().build();
            HttpResponse<byte[]> download = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (download.statusCode() < 200 || download.statusCode() >= 300
                    || download.body().length == 0 || download.body().length > MAX_IMAGE_BYTES) {
                throw invalid("IMAGE_DOWNLOAD_INVALID");
            }
            String contentType = download.headers().firstValue("Content-Type").orElse("image/png");
            return new ImagePayload(download.body(), detectContentType(download.body(), contentType));
        } catch (GenerationFailure error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new GenerationFailure("IMAGE_REQUEST_INTERRUPTED", "图片生成已停止", "FAILED", true);
        } catch (IOException | IllegalArgumentException error) {
            throw invalid("IMAGE_RESPONSE_INVALID");
        }
    }

    JsonNode analyzeImage(ImagePayload image, JsonNode sceneSpec) {
        if (!visionConfigured()) throw new GenerationFailure("VISION_AI_NOT_CONFIGURED", "视觉模型未配置", "FAILED", false);
        String dataUrl = "data:" + image.contentType() + ";base64," + Base64.getEncoder().encodeToString(image.bytes());
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", config.visionModel());
        payload.put("temperature", 0.1);
        payload.put("max_tokens", 1600);
        if ("MiniMax-M3".equalsIgnoreCase(config.visionModel())) {
            payload.putObject("thinking").put("type", "disabled");
        }
        ArrayNode messages = payload.putArray("messages");
        messages.addObject().put("role", "system").put("content", """
                你是儿童图片观察游戏的视觉核验器。只描述实际图像，不发明元素，不识别真实身份。
                参照 sceneSpec 的稳定元素 ID，把实际看到的元素映射回 sceneElementId；看不到就不要返回。
                只返回 JSON：{"safety":{"status":"SAFE|REJECTED","reason":"..."},"detections":[{"sceneElementId":"...","label":"...","confidence":0.0,"relation":"..."}],"altText":"..."}。
                """);
        ObjectNode user = messages.addObject();
        user.put("role", "user");
        ArrayNode content = user.putArray("content");
        content.addObject().put("type", "text").put("text", "sceneSpec=" + sceneSpec);
        content.addObject().put("type", "image_url").putObject("image_url").put("url", dataUrl);
        String response = sendJson(chatEndpoint(config.visionBaseUrl()), config.visionApiKey(), payload.toString());
        return parseChatJson(response);
    }

    private JsonNode chatJson(String baseUrl, String apiKey, String model, String system, String user, String imageUrl) {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("model", model);
        payload.put("temperature", 0.45);
        payload.put("max_tokens", 3800);
        payload.putObject("response_format").put("type", "json_object");
        ArrayNode messages = payload.putArray("messages");
        messages.addObject().put("role", "system").put("content", system);
        messages.addObject().put("role", "user").put("content", user);
        return parseChatJson(sendJson(chatEndpoint(baseUrl), apiKey, payload.toString()));
    }

    private JsonNode parseChatJson(String response) {
        try {
            JsonNode envelope = objectMapper.readTree(response);
            String content = envelope.path("choices").path(0).path("message").path("content").asText("").trim();
            if (content.startsWith("```")) {
                int line = content.indexOf('\n');
                int end = content.lastIndexOf("```");
                if (line >= 0 && end > line) content = content.substring(line + 1, end).trim();
            }
            JsonNode result = objectMapper.readTree(content);
            if (!result.isObject()) throw invalid("AI_RESPONSE_INVALID");
            String safety = result.path("safety").isTextual()
                    ? result.path("safety").asText("")
                    : result.path("safety").path("status").asText("");
            if ("REJECTED".equalsIgnoreCase(safety) || "BLOCKED".equalsIgnoreCase(safety)) {
                throw new GenerationFailure("AI_CONTENT_REJECTED", "本次内容未通过儿童安全审核", "REJECTED", true);
            }
            return result;
        } catch (GenerationFailure error) {
            throw error;
        } catch (Exception error) {
            throw invalid("AI_RESPONSE_INVALID");
        }
    }

    private String sendJson(URI endpoint, String apiKey, String body) {
        return sendJson(endpoint, apiKey, body, 2, config.timeout());
    }

    private String sendJson(URI endpoint, String apiKey, String body, int maxAttempts, Duration timeout) {
        GenerationFailure last = null;
        for (int attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
                HttpRequest request = HttpRequest.newBuilder(endpoint)
                        .timeout(timeout)
                        .header("Authorization", "Bearer " + apiKey)
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                        .build();
                CompletableFuture<HttpResponse<String>> responseFuture =
                        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                HttpResponse<String> response;
                try {
                    response = responseFuture.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
                } catch (TimeoutException error) {
                    responseFuture.cancel(true);
                    last = new GenerationFailure("AI_TIMEOUT", "AI 生成超时", "FAILED", true);
                    continue;
                } catch (ExecutionException error) {
                    Throwable cause = error.getCause();
                    last = cause instanceof java.net.http.HttpTimeoutException
                            ? new GenerationFailure("AI_TIMEOUT", "AI 生成超时", "FAILED", true)
                            : new GenerationFailure("AI_UNAVAILABLE", "当前无法连接 AI 服务", "FAILED", true);
                    continue;
                }
                if (response.statusCode() >= 200 && response.statusCode() < 300) return response.body();
                boolean retryable = response.statusCode() == 429 || response.statusCode() >= 500;
                last = new GenerationFailure(
                        "AI_PROVIDER_ERROR",
                        retryable ? "AI 服务暂时繁忙" : "AI 服务拒绝了本次生成",
                        retryable ? "FAILED" : "REJECTED",
                        retryable
                );
                if (!retryable) break;
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new GenerationFailure("AI_REQUEST_INTERRUPTED", "AI 生成已停止", "FAILED", true);
            } catch (IllegalArgumentException error) {
                last = new GenerationFailure("AI_UNAVAILABLE", "当前无法连接 AI 服务", "FAILED", true);
            }
        }
        throw last == null ? new GenerationFailure("AI_UNAVAILABLE", "当前无法连接 AI 服务", "FAILED", true) : last;
    }

    private GenerationFailure invalid(String code) {
        return new GenerationFailure(code, "AI 返回内容未通过结构校验", "FAILED", true);
    }

    private static URI chatEndpoint(String baseUrl) {
        String base = baseUrl.trim().replaceAll("/+$", "");
        if (!base.toLowerCase(Locale.ROOT).endsWith("/chat/completions")) base += "/chat/completions";
        return URI.create(base);
    }

    private static URI imageEndpoint(String baseUrl) {
        String base = baseUrl.trim().replaceAll("/+$", "");
        if (base.endsWith("/images/generations")) return URI.create(base);
        if (base.endsWith("/v1")) return URI.create(base + "/images/generations");
        return URI.create(base + "/v1/images/generations");
    }

    private static String stripDataPrefix(String value) {
        int comma = value.indexOf(',');
        return value.startsWith("data:") && comma >= 0 ? value.substring(comma + 1) : value;
    }

    private static String dataContentType(String value) {
        int colon = value.indexOf(':');
        int semicolon = value.indexOf(';');
        return colon >= 0 && semicolon > colon ? value.substring(colon + 1, semicolon) : "image/png";
    }

    private static String detectContentType(byte[] bytes, String fallback) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8) return "image/jpeg";
        if (bytes.length >= 12
                && new String(bytes, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        if (bytes.length >= 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N') return "image/png";
        return fallback;
    }

    private static boolean complete(String... values) {
        for (String value : values) if (value == null || value.isBlank()) return false;
        return true;
    }

    private static String value(Environment environment, String direct, String mapped) {
        String value = environment.getProperty(direct);
        if ((value == null || value.isBlank()) && mapped != null) value = environment.getProperty(mapped);
        return value == null ? "" : value.trim();
    }

    private static String defaulted(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static long longValue(Environment environment, String key, long fallback, long min, long max) {
        try {
            long value = Long.parseLong(environment.getProperty(key, String.valueOf(fallback)));
            return Math.max(min, Math.min(max, value));
        } catch (NumberFormatException error) {
            return fallback;
        }
    }

    record ImagePayload(byte[] bytes, String contentType) {
    }

    record Config(
            String textBaseUrl,
            String textApiKey,
            String textModel,
            String imageBaseUrl,
            String imageApiKey,
            String imageModel,
            String visionBaseUrl,
            String visionApiKey,
            String visionModel,
            Duration timeout
    ) {
    }
}
