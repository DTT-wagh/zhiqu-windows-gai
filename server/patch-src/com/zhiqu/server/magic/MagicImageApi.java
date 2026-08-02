package com.zhiqu.server.magic;

import java.io.IOException;
import java.io.Reader;
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

public final class MagicImageApi {
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .build();

    private MagicImageApi() {
    }

    public static String generate(String roomId, List<String> terms) {
        Config config = Config.load();
        if (config.baseUrl().isBlank() || config.apiKey().isBlank() || config.model().isBlank()) {
            throw new IllegalStateException("画里藏词图片 API 未完整配置");
        }

        String payload = jsonPayload(config.model(), buildPrompt(terms));

        try {
            HttpRequest request = HttpRequest.newBuilder(imageEndpoint(config.baseUrl()))
                    .timeout(Duration.ofMinutes(3))
                    .header("Authorization", "Bearer " + config.apiKey())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = HTTP.send(
                    request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("画里藏词图片生成失败，API 状态码 " + response.statusCode()
                        + errorMessage(response.body()));
            }

            String remoteUrl = extractJsonString(response.body(), "url");
            if (!remoteUrl.isBlank()) {
                if (remoteUrl.startsWith("data:")) {
                    return storeBase64Image(config, roomId, remoteUrl);
                }
                return remoteUrl;
            }

            String base64 = extractJsonString(response.body(), "b64_json");
            if (!base64.isBlank()) {
                return storeBase64Image(config, roomId, base64);
            }
            throw new IllegalStateException("画里藏词图片 API 未返回图片 URL 或图片数据");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("画里藏词图片生成被中断", exception);
        } catch (IOException exception) {
            throw new IllegalStateException("无法连接画里藏词图片 API", exception);
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

    private static String buildPrompt(List<String> terms) {
        if (terms == null || terms.size() < 4) {
            throw new IllegalArgumentException("画里藏词需要四个提示词");
        }
        return "生成一张适合青少年图文推理游戏的方形插画。画面必须自然、清晰地同时包含以下四项线索："
                + "场景“" + terms.get(0) + "”，主体“" + terms.get(1) + "”，氛围“" + terms.get(2)
                + "”，画风“" + terms.get(3) + "”。不要出现文字、标签、水印或边框。";
    }

    private static String jsonPayload(String model, String prompt) {
        return "{\"model\":\"" + jsonEscape(model) + "\",\"prompt\":\""
                + jsonEscape(prompt) + "\",\"n\":1,\"size\":\"1024x1024\"}";
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
        String extension = detectExtension(bytes);
        String key = UUID.nameUUIDFromBytes((roomId + ":" + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8))
                .toString()
                .replace("-", "");
        Path directory = Path.of(config.mediaRoot()).toAbsolutePath().normalize().resolve("profile-avatars");
        Files.createDirectories(directory);
        Files.write(directory.resolve(key + "." + extension), bytes);
        return config.publicBaseUrl().replaceAll("/+$", "") + "/" + key;
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

    private record Config(
            String baseUrl,
            String apiKey,
            String model,
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
