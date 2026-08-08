package com.zhiqu.server.singleplayer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.UUID;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
final class SinglePlayerMediaStore {
    private static final long MAX_IMAGE_BYTES = 8L * 1024L * 1024L;
    private final Path root;

    SinglePlayerMediaStore(Environment environment) {
        String configured = environment.getProperty("MEDIA_ROOT");
        if (configured == null || configured.isBlank()) configured = environment.getProperty("app.media.root", "./data/media");
        this.root = Path.of(configured).toAbsolutePath().normalize().resolve("single-player-games");
    }

    MediaRef saveImage(String instanceId, byte[] bytes, String contentType) {
        if (!validId(instanceId) || bytes == null || bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES) {
            throw new SinglePlayerGameErrors.GenerationFailure(
                    "IMAGE_RESOURCE_INVALID", "生成的图片资源无效", "FAILED", true);
        }
        String extension = extension(bytes, contentType);
        String key = UUID.randomUUID().toString().replace("-", "") + "." + extension;
        Path directory = root.resolve(instanceId).normalize();
        Path target = directory.resolve(key).normalize();
        if (!directory.startsWith(root) || !target.startsWith(directory)) {
            throw new SinglePlayerGameErrors.GenerationFailure(
                    "IMAGE_STORAGE_INVALID", "图片存储路径无效", "FAILED", false);
        }
        try {
            Files.createDirectories(directory);
            Files.write(target, bytes);
        } catch (IOException error) {
            throw new SinglePlayerGameErrors.GenerationFailure(
                    "IMAGE_STORAGE_FAILED", "无法保存本局图片", "FAILED", true);
        }
        return new MediaRef(
                "/api/single-player-games/media/" + instanceId + "/" + key,
                key,
                mediaType(extension)
        );
    }

    StoredMedia read(String instanceId, String key) {
        if (!validId(instanceId) || key == null || !key.matches("[0-9a-f]{32}\\.(png|jpg|webp)")) return null;
        Path directory = root.resolve(instanceId).normalize();
        Path target = directory.resolve(key).normalize();
        if (!directory.startsWith(root) || !target.startsWith(directory) || !Files.isRegularFile(target)) return null;
        try {
            return new StoredMedia(Files.readAllBytes(target), mediaType(key.substring(key.lastIndexOf('.') + 1)));
        } catch (IOException error) {
            return null;
        }
    }

    private static boolean validId(String value) {
        return value != null && value.matches("[0-9a-fA-F-]{36}");
    }

    private static String extension(byte[] bytes, String contentType) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8) return "jpg";
        if (bytes.length >= 12
                && new String(bytes, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                && new String(bytes, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) return "webp";
        if (bytes.length >= 8
                && (bytes[0] & 0xff) == 0x89
                && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G') return "png";
        String normalized = contentType == null ? "" : contentType.toLowerCase(Locale.ROOT);
        if (normalized.contains("jpeg") || normalized.contains("jpg")) return "jpg";
        if (normalized.contains("webp")) return "webp";
        if (normalized.contains("png")) return "png";
        throw new SinglePlayerGameErrors.GenerationFailure(
                "IMAGE_FORMAT_INVALID", "图片格式未通过校验", "FAILED", true);
    }

    private static String mediaType(String extension) {
        return switch (extension) {
            case "jpg" -> "image/jpeg";
            case "webp" -> "image/webp";
            default -> "image/png";
        };
    }

    record MediaRef(String url, String key, String contentType) {
    }

    record StoredMedia(byte[] bytes, String contentType) {
    }
}
