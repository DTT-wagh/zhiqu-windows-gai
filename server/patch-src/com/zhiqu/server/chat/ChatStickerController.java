package com.zhiqu.server.chat;

import com.zhiqu.server.common.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat/stickers")
public class ChatStickerController {
    @GetMapping
    public List<Map<String, Object>> list(Authentication authentication) {
        currentUser(authentication);
        return List.of();
    }

    @PostMapping
    public Map<String, Object> add(
            @RequestBody AddStickerRequest request,
            Authentication authentication) {
        currentUser(authentication);
        throw new ApiException(HttpStatus.FORBIDDEN, "CHAT_CUSTOM_STICKER_DISABLED", "儿童版暂不支持用户自定义图片表情");
    }

    public record AddStickerRequest(String key) {}

    private static String currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "请先登录");
        }
        return authentication.getName();
    }
}
