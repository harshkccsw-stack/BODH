package com.bodhpsychometric;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling is on for ActivityLogPurge — the activity trail records every
// request, so nothing but retention keeps that table from growing forever.
@EnableScheduling
@SpringBootApplication
public class BodhpsychometricApplication {

	public static void main(String[] args) {
		SpringApplication.run(BodhpsychometricApplication.class, args);
	}

}
