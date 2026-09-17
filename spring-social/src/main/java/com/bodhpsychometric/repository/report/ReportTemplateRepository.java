package com.bodhpsychometric.repository.report;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.report.ReportTemplate;

public interface ReportTemplateRepository extends JpaRepository<ReportTemplate, Long> {

    /**
     * The library list, newest first. Bindings are fetched with it because
     * every row shows a "n of m tags bound" count and doing that lazily is a
     * query per template.
     */
    @Query("""
            select distinct t from ReportTemplate t
            left join fetch t.bindings
            order by t.updatedAt desc
            """)
    List<ReportTemplate> findAllWithBindings();

    @Query("""
            select t from ReportTemplate t
            left join fetch t.bindings
            where t.reportTemplateId = :id
            """)
    Optional<ReportTemplate> findByIdWithBindings(@Param("id") Long id);

    /**
     * Pre-check for the duplicate-name conflict. Names are unique per version,
     * so this asks "is this name already taken at this version" — which is
     * what a create or a rename has to refuse with a 409.
     */
    boolean existsByNameIgnoreCaseAndVersion(String name, int version);

    boolean existsByNameIgnoreCaseAndVersionAndReportTemplateIdNot(
            String name, int version, Long reportTemplateId);

    /**
     * Every version filed under one name — the whole family a rename moves.
     *
     * <p>A rename that touched only the row the user clicked would split the
     * family in two: {@code findMaxVersionForName} would then start a renamed
     * v3 back at v1, and the unique key on (name, version) would let two
     * unrelated documents share a name and a version number.
     */
    List<ReportTemplate> findAllByNameIgnoreCase(String name);

    /** Is this name taken by ANY version, i.e. by another family. */
    boolean existsByNameIgnoreCase(String name);

    /** Highest version published under this name, for the publish bump. */
    @Query("select max(t.version) from ReportTemplate t where lower(t.name) = lower(:name)")
    Optional<Integer> findMaxVersionForName(@Param("name") String name);
}
