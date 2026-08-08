package com.zhiqu.server.singleplayer;

import com.zhiqu.server.common.ApiException;
import org.springframework.http.HttpStatus;

final class SinglePlayerGameErrors {
    private SinglePlayerGameErrors() {
    }

    static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "SINGLE_PLAYER_INSTANCE_NOT_FOUND", "本局不存在或已经不可访问");
    }

    static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    static ApiException unavailable(String code, String message) {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, code, message);
    }

    static final class GenerationFailure extends RuntimeException {
        private final String code;
        private final String state;
        private final boolean retryable;

        GenerationFailure(String code, String message, String state, boolean retryable) {
            super(message);
            this.code = code;
            this.state = state;
            this.retryable = retryable;
        }

        String code() {
            return code;
        }

        String state() {
            return state;
        }

        boolean retryable() {
            return retryable;
        }
    }
}
