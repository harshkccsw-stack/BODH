package com.bodhpsychometric.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins:http://localhost:3000,http://localhost:5173}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // allowedOriginPatterns, NOT allowedOrigins: the latter compares the
        // Origin header as an exact string, so a configured "https://*.bodh.biz"
        // matches nothing and every subdomain gets a 403 "Invalid CORS request".
        // Patterns keep literal entries working unchanged and let the wildcard
        // ones do what they read like. (Patterns are also the only form allowed
        // alongside allowCredentials(true) — a bare "*" throws at startup.)
        registry.addMapping("/**")
                .allowedOriginPatterns(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
