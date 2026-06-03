package com.bodhpsychometric.bodhassess.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Respondent;

@Repository
public interface RespondentRepository extends JpaRepository<Respondent, String> {

    @Query("SELECT r FROM Respondent r ORDER BY r.createdAt DESC")
    List<Respondent> findAllOrderByCreatedAt();

    @Query("SELECT r FROM Respondent r WHERE LOWER(r.email) = LOWER(:email) AND r.dob = :dob")
    Optional<Respondent> findByEmailAndDob(@Param("email") String email, @Param("dob") String dob);

    // Phone match is digits-only — the stored phone may carry separators (+,
    // space, dash, parens). We pull all rows with this DOB+phone and let the
    // service do the digit-normalised comparison.
    @Query("SELECT r FROM Respondent r WHERE r.dob = :dob AND r.phone IS NOT NULL")
    List<Respondent> findByDobWithPhone(@Param("dob") String dob);

    // Returning-registrant dedup: same DOB AND any one of email / phone /
    // company id. Each channel only participates when its param is non-null,
    // so a blank field never collides with another row's blank field.
    @Query("SELECT r FROM Respondent r WHERE r.dob = :dob AND ("
         + "(:email IS NOT NULL AND LOWER(r.email) = LOWER(:email)) "
         + "OR (:phone IS NOT NULL AND r.phone = :phone) "
         + "OR (:companyId IS NOT NULL AND r.companyId = :companyId))")
    List<Respondent> findDuplicates(@Param("email") String email,
                                    @Param("phone") String phone,
                                    @Param("companyId") String companyId,
                                    @Param("dob") String dob);
}
