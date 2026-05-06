package com.bodhpsychometric.bodhassess;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.bodhpsychometric.bodhassess.config.AppProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
public class BodhassessApplication {

    public static void main(String[] args) {
        SpringApplication.run(BodhassessApplication.class, args);
    }
}
