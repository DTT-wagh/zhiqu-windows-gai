package com.zhiqu.server.magic;

import com.zhiqu.server.common.ApiException;
import java.io.IOException;
import java.io.Reader;
import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;

public final class MagicImageApi {
    private static final Logger LOGGER = LoggerFactory.getLogger(MagicImageApi.class);
    private static final int MAX_IMAGE_BYTES = 8 * 1024 * 1024;
    private static final int PROVIDER_ATTEMPTS = 2;
    // One stuck upstream request must not consume the whole generation window.
    // Two bounded attempts still allow the provider's normal 1-2 minute latency.
    private static final Duration IMAGE_TIMEOUT = Duration.ofSeconds(150);
    private static final List<List<String>> TERM_GROUPS = List.of(
            List.of("海边灯塔", "雪山小屋", "城市天台", "热带雨林"),
            List.of("一只橘猫", "一个小机器人", "一位穿黄色雨衣的孩子", "一只白色风筝"),
            List.of("清晨薄雾", "金色夕阳", "雨后彩虹", "蓝色月夜"),
            List.of("童话水彩", "彩色蜡笔", "立体纸雕", "黏土定格")
    );
    private MagicImageApi() {
    }

    public static String generate(String roomId, List<String> terms) {
        MagicImageProgress.update(roomId, "PREPARING", 8, "正在整理四个提示词");
        Config config = Config.load();
        if (config.baseUrl().isBlank() || config.apiKey().isBlank() || config.model().isBlank()) {
            MagicImageProgress.failed(roomId, "图片服务尚未配置");
            throw unavailable("图片服务尚未配置，请联系管理员检查图片模型设置");
        }

        validateTerms(terms);
        String payload = jsonPayload(config.model(), buildPrompt(terms));
        HttpClient http = httpClient(config.proxyUrl());
        MagicImageProgress.update(roomId, "REQUESTING", 25, "正在请求图片生成模型");

        try {
            HttpRequest request = HttpRequest.newBuilder(imageEndpoint(config.baseUrl()))
                    .timeout(IMAGE_TIMEOUT)
                    .header("Authorization", "Bearer " + config.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = requestImage(http, roomId, request);
            MagicImageProgress.update(roomId, "RECEIVING", 65, "已收到模型响应，正在处理图片");

            String remoteUrl = extractJsonString(response.body(), "url");
            if (!remoteUrl.isBlank()) {
                if (remoteUrl.startsWith("data:")) {
                    return storeBase64Image(config, roomId, remoteUrl);
                }
                return storeRemoteImage(http, config, roomId, remoteUrl);
            }

            String base64 = extractJsonString(response.body(), "b64_json");
            if (!base64.isBlank()) {
                MagicImageProgress.update(roomId, "DECODING", 78, "正在解码生成图片");
                return storeBase64Image(config, roomId, base64);
            }
            throw unavailable("图片服务未返回有效图片，请稍后重新生成");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            MagicImageProgress.failed(roomId, "图片生成已中断");
            throw unavailable("图片生成已中断，请重新尝试");
        } catch (IOException exception) {
            MagicImageProgress.failed(roomId, isTimeout(exception) ? "图片服务响应超时" : "暂时无法连接图片服务");
            throw unavailable(isTimeout(exception)
                    ? "图片服务响应超时，请稍后重试"
                    : "暂时无法连接图片服务，请稍后重试");
        } catch (RuntimeException exception) {
            MagicImageProgress.failed(roomId, exception.getMessage() == null ? "图片生成失败" : exception.getMessage());
            throw exception;
        }
    }

    private static URI imageEndpoint(String baseUrl) {
        String normalized = baseUrl.trim().replaceAll("/+$", "");
        if (normalized.endsWith("/images/generations")) {
            return URI.create(normalized);
        }
        if (normalized.endsWith("/v1")) {
            return URI.create(normalized + "/images/generations");
        }
        return URI.create(normalized + "/v1/images/generations");
    }

    private static HttpClient httpClient(String proxyUrl) {
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(20));
        if (proxyUrl == null || proxyUrl.isBlank()) {
            return builder.build();
        }

        URI proxy = URI.create(proxyUrl.trim());
        if (proxy.getHost() == null || proxy.getHost().isBlank()) {
            throw new IllegalStateException("图片服务代理地址无效");
        }
        int port = proxy.getPort();
        if (port < 0) {
            port = "https".equalsIgnoreCase(proxy.getScheme()) ? 443 : 80;
        }
        LOGGER.info("Magic image provider will use configured proxy {}:{}", proxy.getHost(), port);
        return builder.proxy(ProxySelector.of(new InetSocketAddress(proxy.getHost(), port))).build();
    }

    private static HttpResponse<String> requestImage(HttpClient http, String roomId, HttpRequest request)
            throws IOException, InterruptedException {
        IOException lastConnectionFailure = null;
        for (int attempt = 1; attempt <= PROVIDER_ATTEMPTS; attempt += 1) {
            long startedAt = System.nanoTime();
            if (attempt > 1) {
                MagicImageProgress.update(roomId, "RETRYING", 32, "图片服务繁忙，正在自动重试");
            }
            try {
                HttpResponse<String> response = sendString(http, request);
                long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    LOGGER.info("Magic image provider completed room {} attempt {} in {} ms", roomId, attempt, elapsedMillis);
                    return response;
                }
                LOGGER.warn("Magic image provider returned status {} for room {} attempt {} after {} ms",
                        response.statusCode(), roomId, attempt, elapsedMillis);
                if (attempt < PROVIDER_ATTEMPTS && retryableStatus(response.statusCode())) continue;
                throw providerFailure(response.statusCode(), response.body());
            } catch (IOException exception) {
                long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
                LOGGER.warn("Magic image provider connection failed for room {} attempt {} after {} ms: {}",
                        roomId, attempt, elapsedMillis, exception.getMessage());
                lastConnectionFailure = exception;
                if (attempt >= PROVIDER_ATTEMPTS) throw exception;
            }
        }
        throw lastConnectionFailure == null
                ? new IOException("图片服务没有返回结果")
                : lastConnectionFailure;
    }

    private static boolean retryableStatus(int statusCode) {
        return statusCode == 408 || statusCode == 429 || statusCode >= 500;
    }

    private static String buildPrompt(List<String> terms) {
        if (terms == null || terms.size() < 4) {
            throw new IllegalArgumentException("画里藏词需要四个提示词");
        }
        return "生成一张适合青少年图文推理游戏的方形插画。画面必须自然、清晰地同时包含以下四项线索："
                + "场景“" + terms.get(0) + "”，主体“" + terms.get(1) + "”，氛围“" + terms.get(2)
                + "”，画风“" + terms.get(3) + "”。不要出现文字、标签、水印或边框。";
    }

    public static void validateTerms(List<String> terms) {
        if (terms == null || terms.size() != TERM_GROUPS.size()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "MAGIC_TERMS_REQUIRED", "请选择场景、主体、氛围和画风各一个提示词");
        }
        for (int index = 0; index < TERM_GROUPS.size(); index += 1) {
            String term = terms.get(index) == null ? "" : terms.get(index).trim();
            if (!TERM_GROUPS.get(index).contains(term)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MAGIC_TERM_INVALID",
                        "第" + (index + 1) + "类提示词不正确，请重新选择");
            }
        }
    }

    private static String jsonPayload(String model, String prompt) {
        return "{\"model\":\"" + jsonEscape(model) + "\",\"prompt\":\""
                + jsonEscape(prompt) + "\",\"n\":1,\"size\":\"512x512\",\"quality\":\"low\"}";
    }

    private static String jsonEscape(String value) {
        StringBuilder escaped = new StringBuilder(value.length() + 16);
        for (int index = 0; index < value.length(); index += 1) {
            char character = value.charAt(index);
            switch (character) {
                case '\\' -> escaped.append("\\\\");
                case '"' -> escaped.append("\\\"");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> escaped.append(character);
            }
        }
        return escaped.toString();
    }

    private static String extractJsonString(String json, String key) {
        String marker = "\"" + key + "\"";
        int searchFrom = 0;
        while (searchFrom < json.length()) {
            int keyStart = json.indexOf(marker, searchFrom);
            if (keyStart < 0) {
                return "";
            }
            int cursor = keyStart + marker.length();
            while (cursor < json.length() && Character.isWhitespace(json.charAt(cursor))) {
                cursor += 1;
            }
            if (cursor >= json.length() || json.charAt(cursor) != ':') {
                searchFrom = cursor;
                continue;
            }
            cursor += 1;
            while (cursor < json.length() && Character.isWhitespace(json.charAt(cursor))) {
                cursor += 1;
            }
            if (cursor >= json.length() || json.charAt(cursor) != '"') {
                searchFrom = cursor;
                continue;
            }
            StringBuilder value = new StringBuilder();
            boolean escaped = false;
            for (cursor += 1; cursor < json.length(); cursor += 1) {
                char character = json.charAt(cursor);
                if (escaped) {
                    switch (character) {
                        case '"', '\\', '/' -> value.append(character);
                        case 'b' -> value.append('\b');
                        case 'f' -> value.append('\f');
                        case 'n' -> value.append('\n');
                        case 'r' -> value.append('\r');
                        case 't' -> value.append('\t');
                        case 'u' -> {
                            if (cursor + 4 >= json.length()) {
                                return "";
                            }
                            value.append((char) Integer.parseInt(json.substring(cursor + 1, cursor + 5), 16));
                            cursor += 4;
                        }
                        default -> value.append(character);
                    }
                    escaped = false;
                } else if (character == '\\') {
                    escaped = true;
                } else if (character == '"') {
                    return value.toString().trim();
                } else {
                    value.append(character);
                }
            }
            return "";
        }
        return "";
    }

    private static String storeBase64Image(Config config, String roomId, String encoded) throws IOException {
        String raw = encoded;
        int comma = raw.indexOf(',');
        if (raw.startsWith("data:") && comma >= 0) {
            raw = raw.substring(comma + 1);
        }
        byte[] bytes = Base64.getDecoder().decode(raw);
        return storeImage(config, roomId, bytes);
    }

    private static String storeRemoteImage(HttpClient http, Config config, String roomId, String url) throws IOException, InterruptedException {
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            throw unavailable("图片服务返回的图片地址无效，请重新生成");
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(IMAGE_TIMEOUT)
                .GET()
                .build();
        HttpResponse<byte[]> response = sendBytes(http, request);
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw unavailable("生成图片下载失败，请稍后重试");
        }
        if (response.body().length == 0) {
            throw unavailable("生成图片内容为空，请重新生成");
        }
        if (response.body().length > MAX_IMAGE_BYTES) {
            throw unavailable("生成图片文件过大，请重新生成");
        }
        return storeImage(config, roomId, response.body());
    }

    private static String storeImage(Config config, String roomId, byte[] bytes) throws IOException {
        if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES) {
            throw unavailable("生成图片文件无效，请重新生成");
        }
        String extension = detectExtension(bytes);
        String key = UUID.nameUUIDFromBytes((roomId + ":" + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8))
                .toString()
                .replace("-", "");
        Path directory = Path.of(config.mediaRoot()).toAbsolutePath().normalize().resolve("profile-avatars");
        Files.createDirectories(directory);
        MagicImageProgress.update(roomId, "SAVING", 92, "正在保存生成图片");
        Files.write(directory.resolve(key + "." + extension), bytes);
        String imageUrl = config.publicBaseUrl().replaceAll("/+$", "") + "/" + key;
        MagicImageProgress.ready(roomId, imageUrl);
        return imageUrl;
    }

    private static HttpResponse<String> sendString(HttpClient http, HttpRequest request) throws IOException, InterruptedException {
        return await(http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)));
    }

    private static HttpResponse<byte[]> sendBytes(HttpClient http, HttpRequest request) throws IOException, InterruptedException {
        return await(http.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray()));
    }

    private static <T> HttpResponse<T> await(CompletableFuture<HttpResponse<T>> future) throws IOException, InterruptedException {
        try {
            return future.get(IMAGE_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new IOException("画里藏词图片生成超时", exception);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof IOException ioException) throw ioException;
            throw new IOException("无法连接画里藏词图片 API", cause);
        }
    }

    private static String detectExtension(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8) {
            return "jpg";
        }
        if (bytes.length >= 12
                && new String(bytes, 0, 4, StandardCharsets.US_ASCII).equals("RIFF")
                && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) {
            return "webp";
        }
        return "png";
    }

    private static String errorMessage(String responseBody) {
        String message = extractJsonString(responseBody, "message");
        return message.isBlank() ? "" : "：" + message;
    }

    private static ApiException providerFailure(int statusCode, String responseBody) {
        if (statusCode == 401 || statusCode == 403) {
            return unavailable("图片服务授权失败，请联系管理员检查图片模型配置");
        }
        if (statusCode == 429 || statusCode >= 500) {
            return unavailable("图片服务繁忙，请稍后重试");
        }
        String detail = errorMessage(responseBody);
        return new ApiException(HttpStatus.BAD_GATEWAY, "MAGIC_IMAGE_PROVIDER_REJECTED",
                detail.isBlank() ? "图片服务拒绝了本次生成，请调整提示词后重试" : "图片服务拒绝了本次生成" + detail);
    }

    private static ApiException unavailable(String message) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "MAGIC_IMAGE_UNAVAILABLE", message);
    }

    private static boolean isTimeout(Throwable error) {
        Throwable current = error;
        while (current != null) {
            if (current instanceof TimeoutException || current instanceof java.net.http.HttpTimeoutException) return true;
            current = current.getCause();
        }
        return false;
    }

    private record Config(
            String baseUrl,
            String apiKey,
            String model,
            String proxyUrl,
            String mediaRoot,
            String publicBaseUrl
    ) {
        private static Config load() {
            Properties properties = new Properties();
            Path envFile = Path.of(".env");
            if (Files.isRegularFile(envFile)) {
                try (Reader reader = Files.newBufferedReader(envFile, StandardCharsets.UTF_8)) {
                    properties.load(reader);
                } catch (IOException exception) {
                    throw new IllegalStateException("无法读取画里藏词图片 API 配置", exception);
                }
            }

            String port = value(properties, "SERVER_PORT", "8080");
            return new Config(
                    value(properties, "MAGIC_IMAGE_BASE_URL", ""),
                    value(properties, "MAGIC_IMAGE_API_KEY", ""),
                    value(properties, "MAGIC_IMAGE_MODEL", ""),
                    value(properties, "MAGIC_IMAGE_PROXY_URL", ""),
                    value(properties, "MEDIA_ROOT", "./data/media"),
                    value(properties, "MAGIC_IMAGE_PUBLIC_BASE_URL", "http://localhost:" + port + "/api/social/avatars")
            );
        }

        private static String value(Properties properties, String key, String fallback) {
            String environmentValue = System.getenv(key);
            if (environmentValue != null && !environmentValue.isBlank()) {
                return environmentValue.trim();
            }
            return properties.getProperty(key, fallback).trim();
        }
    }
}
