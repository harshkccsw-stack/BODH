package com.bodhpsychometric.bodhassess.v2;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * The rebuilt API. Scans the domain module for entities, repositories,
 * services, and the auditing config; SecurityCurrentUserResolver bridges the
 * JWT principal into createdBy/updatedBy auditing.
 */
@SpringBootApplication(scanBasePackages = "com.bodhpsychometric.bodhassess")
@EnableJpaRepositories(basePackages = "com.bodhpsychometric.bodhassess.domain.repository")
@EntityScan(basePackages = "com.bodhpsychometric.bodhassess.domain")
public class ApiV2Application {

    public static void main(String[] args) {
        SpringApplication.run(ApiV2Application.class, args);
    }
}
