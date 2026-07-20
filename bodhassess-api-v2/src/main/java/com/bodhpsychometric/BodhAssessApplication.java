package com.bodhpsychometric;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * The rebuilt API. Scans the domain module for entities, repositories,
 * services, and the auditing config; SecurityCurrentUserResolver bridges the
 * JWT principal into createdBy/updatedBy auditing.
 */
@SpringBootApplication
public class BodhAssessApplication {

    public static void main(String[] args) {
        SpringApplication.run(BodhAssessApplication.class, args);
    }
}
