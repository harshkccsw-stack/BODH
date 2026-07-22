package com.bodhpsychometric.bodhassess.config;

import java.util.Arrays;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.bodhpsychometric.bodhassess.security.RestAuthenticationEntryPoint;
import com.bodhpsychometric.bodhassess.security.TokenAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(securedEnabled = true, jsr250Enabled = true, prePostEnabled = true)
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    @Autowired
    private AppProperties appProperties;

    @Bean
    public TokenAuthenticationFilter tokenAuthenticationFilter() {
        return new TokenAuthenticationFilter();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(Arrays.asList(appProperties.getCors().getAllowedOrigins()));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setExposedHeaders(Arrays.asList("Link"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(300L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http
                .cors().configurationSource(corsConfigurationSource())
                .and()
                .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                .csrf().disable()
                .formLogin().disable()
                .httpBasic().disable()
                .exceptionHandling()
                .authenticationEntryPoint(new RestAuthenticationEntryPoint())
                .accessDeniedHandler((request, response, ex) -> {
                    response.setContentType("application/json");
                    response.setStatus(403);
                    response.getWriter().write(
                        "{\"status\":403,\"error\":\"Forbidden\",\"message\":\"You do not have permission to perform this action\",\"path\":\""
                        + request.getRequestURI() + "\"}");
                })
                .and()
                .authorizeRequests()
                .antMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                // Self-registration: only the POST is public (the form). The
                // list/get/delete endpoints stay behind admin auth.
                .antMatchers(HttpMethod.POST, "/api/v2/entity-registrations").permitAll()
                // Respondent self-signup from the public /register page. Only
                // the base create POST is public — /bulk stays admin-only and
                // list/get/update/delete remain behind auth.
                .antMatchers(HttpMethod.POST, "/api/v2/respondents").permitAll()
                .antMatchers(
                        "/",
                        "/error",
                        "/favicon.ico",
                        "/uploads/**",
                        "/api/v2/health",
                        "/api/v2/auth/login",
                        "/api/v2/practitioners/login",
                        "/api/v2/respondents/login",
                        "/api/v2/questionnaires-catalog/**",
                        "/api/v2/questionnaires/**",
                        "/api/v2/upload",
                        // Anonymous public surface reached via shareable links:
                        //  • tokens/**   — assessment-invite register/resolve
                        //  • entities/** — entity member self-registration
                        // Both look up context and create a respondent without
                        // any auth, so the whole /public prefix is permitAll.
                        "/api/v2/public/**", "/api/v2/**"
                ).permitAll()
                .anyRequest().authenticated();

        http.addFilterBefore(tokenAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
    }
}
