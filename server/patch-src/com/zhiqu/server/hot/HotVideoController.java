package com.zhiqu.server.hot;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contents")
final class HotVideoController {
    private final HotVideoService service;

    HotVideoController(HotVideoService service) {
        this.service = service;
    }

    @GetMapping("/hot")
    List<HotVideoDtos.HotVideoView> hotVideos() {
        return service.list();
    }
}
