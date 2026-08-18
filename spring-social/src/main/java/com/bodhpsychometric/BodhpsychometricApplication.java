package com.bodhpsychometric;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

// Scheduling is on for ActivityLogPurge — the activity trail records every
// request, so nothing but retention keeps that table from growing forever —
// and for SubmissionDigestService's sweeper, which drains Redis-staged
// submissions into MySQL. Async is for the same digest's immediate
// post-submit attempt (@Async digestAsync), which must run off the
// respondent's request thread — that thread already answered 200.
@EnableAsync
@EnableScheduling
@SpringBootApplication
public class BodhpsychometricApplication {

	public static void main(String[] args) {
		SpringApplication.run(BodhpsychometricApplication.class, args);
	}

}
