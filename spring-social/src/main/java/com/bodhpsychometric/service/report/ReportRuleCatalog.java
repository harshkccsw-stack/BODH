package com.bodhpsychometric.service.report;

import java.util.List;

import org.springframework.stereotype.Service;

import com.bodhpsychometric.repository.report.ReportRuleRepository;

/**
 * The rules library reduced to what the prompt lint needs: every slug.
 *
 * <p>Its own class, tiny as it is, for the same reason
 * {@link ReportColumnCatalog} is one — it lets
 * {@link ReportPromptAssembler} be constructed in a test with a stub answer
 * instead of a repository, which is how every other collaborator in this
 * package is tested.
 */
@Service
public class ReportRuleCatalog {

    private final ReportRuleRepository rules;

    public ReportRuleCatalog(ReportRuleRepository rules) {
        this.rules = rules;
    }

    /** Every slug in the library. Overridden in tests. */
    public List<String> allSlugs() {
        return rules.findAllSlugs();
    }
}
