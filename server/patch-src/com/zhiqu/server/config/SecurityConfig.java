package com.zhiqu.server.config;

import com.zhiqu.server.common.ApiError;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import tools.jackson.databind.ObjectMapper;

@Configuration
@EnableConfigurationProperties({
        SecurityProperties.class,
        AiProperties.class,
        DeepSeekProperties.class,
        MediaProperties.class,
        ContentImportProperties.class,
        TencentVodProperties.class
})
public class SecurityConfig {
    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtFilter,
            ObjectMapper objectMapper
    ) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/api/auth/**",
                                "/api/content-imports/**",
                                "/api/social/avatars/**",
                                "/actuator/health",
                                "/error",
                                "/ws/blind-box",
                                "/ws/truth-game",
                                "/ws/jailbreak-game",
                                "/ws/magic-game"
                        ).permitAll()
                        // Community answers are public, so their published images must be readable without a bearer header.
                        .requestMatchers(HttpMethod.GET, "/api/community/images/**").permitAll()
                        // Published course videos are readable before login; account progress remains protected.
                        .requestMatchers(HttpMethod.GET, "/api/contents/*/playback").permitAll()
                        // Single-player catalog and generated media are public; creating instances and progress stay protected.
                        .requestMatchers(HttpMethod.GET,
                                "/api/single-player-games",
                                "/api/single-player-games/",
                                "/api/single-player-games/media/**"
                        ).permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/categories", "/api/contents", "/api/contents/**").permitAll()
                        .anyRequest().authenticated()
                )
                .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> {
                    response.setStatus(401);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    objectMapper.writeValue(response.getOutputStream(), new ApiError(
                            Instant.now(),
                            401,
                            "UNAUTHORIZED",
                            "请先登录",
                            request.getRequestURI(),
                            Map.of(),
                            Map.of()
                    ));
                }))
                .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}") String allowedOrigins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(Arrays.stream(allowedOrigins.split(",")).map(String::trim).toList());
        configuration.setAllowedOriginPatterns(List.of(
                "http://localhost:[*]",
                "http://127.0.0.1:[*]",
                "http://10.*:[*]",
                "http://192.168.*:[*]",
                "http://172.16.*:[*]",
                "http://172.17.*:[*]",
                "http://172.18.*:[*]",
                "http://172.19.*:[*]",
                "http://172.20.*:[*]",
                "http://172.21.*:[*]",
                "http://172.22.*:[*]",
                "http://172.23.*:[*]",
                "http://172.24.*:[*]",
                "http://172.25.*:[*]",
                "http://172.26.*:[*]",
                "http://172.27.*:[*]",
                "http://172.28.*:[*]",
                "http://172.29.*:[*]",
                "http://172.30.*:[*]",
                "http://172.31.*:[*]"
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-Id", "X-Content-Import-Token"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
