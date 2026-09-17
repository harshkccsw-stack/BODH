package com.bodhpsychometric.model.report;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.ForeignKey;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * A computation's use of one rule, pinned to a specific
 * {@link ReportRuleVersion}.
 *
 * <p>Pinning the version rather than the rule is the whole point. A rule is a
 * shared library object; if a computation referenced the rule itself, someone
 * improving "Extraversion composite" next March would silently change what a
 * report approved last September meant. Nothing else in the design can recover
 * from that, because the approval was of the OUTPUT, not of the formula.
 *
 * <p>The FK to the rule version is deliberately non-cascading: a rule version
 * a computation depends on must not be deletable. The service pre-checks it and
 * answers 409; this constraint is the net behind that check.
 */
@Entity
@Table(name = "ReportComputationRule")
public class ReportComputationRule implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportComputationRuleId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportComputationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRcrComputation"))
    private ReportComputation computation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportRuleVersionId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRcrRuleVersion"))
    private ReportRuleVersion ruleVersion;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getReportComputationRuleId() {
        return reportComputationRuleId;
    }

    public void setReportComputationRuleId(Long reportComputationRuleId) {
        this.reportComputationRuleId = reportComputationRuleId;
    }

    public ReportComputation getComputation() {
        return computation;
    }

    public void setComputation(ReportComputation computation) {
        this.computation = computation;
    }

    public ReportRuleVersion getRuleVersion() {
        return ruleVersion;
    }

    public void setRuleVersion(ReportRuleVersion ruleVersion) {
        this.ruleVersion = ruleVersion;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
