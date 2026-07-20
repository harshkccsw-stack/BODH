package com.bodhpsychometric.config;

import com.bodhpsychometric.security.CurrentUserResolver;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

import com.bodhpsychometric.model.auth.User;

/**
 * Wires BaseEntity's @CreatedBy/@LastModifiedBy. The actual "who is logged
 * in" question is delegated to whatever {@link CurrentUserResolver} bean the
 * host application registers; with none present (batch jobs, migrations,
 * tests) auditing simply records no actor — the columns are nullable by
 * design. Timestamps stay with Hibernate's @CreationTimestamp/@UpdateTimestamp,
 * so no DateTimeProvider is configured here.
 */
@Configuration
@EnableJpaAuditing(auditorAwareRef = "domainAuditorAware")
public class AuditingConfig {

    @Bean(name = "domainAuditorAware")
    public AuditorAware<User> domainAuditorAware(ObjectProvider<CurrentUserResolver> resolver) {
        return () -> {
            CurrentUserResolver r = resolver.getIfAvailable();
            return r == null ? Optional.empty() : r.currentUser();
        };
    }
}
