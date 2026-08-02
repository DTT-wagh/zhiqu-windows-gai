package com.zhiqu.server.community;

import com.zhiqu.server.config.MediaProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/community/images")
public class CommunityImageController {
    private static final long MAX_IMAGE_BYTES = 5L * 1024L * 1024L;
    private final Path imageDirectory;

    public CommunityImageController(MediaProperties mediaProperties) {
        this.imageDirectory = Path.of(mediaProperties.root()).toAbsolutePath().normalize().resolve("community-answer-images");
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, String>> upload(
            @RequestParam("image") MultipartFile image,
            Authentication authentication
    ) {
        ensureAuthenticated(authentication);
        if (image == null || image.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择图片");
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "单张图片不能超过 5MB");
        }

        String extension = extensionFor(image.getContentType());
        if (extension == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "仅支持 JPG、PNG、GIF、WebP 图片");
        }

        String key = UUID.randomUUID().toString().replace("-", "") + "." + extension;
        Path target = imageDirectory.resolve(key).normalize();
        if (!target.startsWith(imageDirectory)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "图片路径无效");
        }

        try {
            Files.createDirectories(imageDirectory);
            try (var stream = image.getInputStream()) {
                Files.copy(stream, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "图片保存失败");
        }

        String url = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/community/images/")
                .path(key)
                .toUriString();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("url", url));
    }

    @GetMapping("/{key}")
    public ResponseEntity<byte[]> get(@PathVariable("key") String key) {
        if (!key.matches("[0-9a-fA-F]{32}\\.(jpg|jpeg|png|gif|webp)")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片不存在");
        }
        Path image = imageDirectory.resolve(key).normalize();
        if (!image.startsWith(imageDirectory) || !Files.isRegularFile(image)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "图片不存在");
        }
        try {
            return ResponseEntity.ok()
                    .contentType(mediaTypeFor(key))
                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable")
                    .header("X-Content-Type-Options", "nosniff")
                    .body(Files.readAllBytes(image));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "图片读取失败");
        }
    }

    private static void ensureAuthenticated(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated() || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "请先登录");
        }
    }

    private static String extensionFor(String contentType) {
        if (contentType == null) return null;
        return switch (contentType.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/gif" -> "gif";
            case "image/webp" -> "webp";
            default -> null;
        };
    }

    private static MediaType mediaTypeFor(String key) {
        String extension = key.substring(key.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        return switch (extension) {
            case "jpg", "jpeg" -> MediaType.IMAGE_JPEG;
            case "png" -> MediaType.IMAGE_PNG;
            case "gif" -> MediaType.IMAGE_GIF;
            case "webp" -> MediaType.parseMediaType("image/webp");
            default -> MediaType.APPLICATION_OCTET_STREAM;
        };
    }
}
