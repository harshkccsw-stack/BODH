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
 * What the psychometrician wants done for one specific {@code ${tag}} —
 * "use the Extraversion composite and the banding statement to fill
 * {@code ${overall_summary}}".
 *
 * <p>Deliberately separate from {@code ReportTagBinding.authorNote}. A binding
 * note belongs to the TEMPLATE and reads the same for everyone who uses it;
 * this belongs to one COMPUTATION, so two computations over the same template
 * can give the same tag different instructions. Collapsing them would make a
 * template un-reusable the moment two teams wanted different wording.
 */
@Entity
@Table(name = "ReportComputationTagGuidance")
public class ReportComputationTagGuidance implements java.io.Serializable {

    public static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long reportComputationTagGuidanceId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reportComputationId", nullable = false,
            foreignKey = @ForeignKey(name = "fkRctgComputation"))
    private ReportComputation computation;

    @Column(name = "tag", nullable = false, length = 80)
    private String tag;

    @Column(name = "guidance", columnDefinition = "TEXT")
    private String guidance;

    @Column(name = "sortOrder", nullable = false)
    private int sortOrder;

    public Long getReportComputationTagGuidanceId() {
        return reportComputationTagGuidanceId;
    }

    public void setReportComputationTagGuidanceId(Long id) {
        this.reportComputationTagGuidanceId = id;
    }

    public ReportComputation getComputation() {
        return computation;
    }

    public void setComputation(ReportComputation computation) {
        this.computation = computation;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }

    public String getGuidance() {
        return guidance;
    }

    public void setGuidance(String guidance) {
        this.guidance = guidance;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
