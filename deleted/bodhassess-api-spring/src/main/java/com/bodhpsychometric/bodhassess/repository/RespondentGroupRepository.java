package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.RespondentGroup;

@Repository
public interface RespondentGroupRepository extends JpaRepository<RespondentGroup, String> {

    @Query("SELECT g FROM RespondentGroup g ORDER BY g.createdAt ASC")
    List<RespondentGroup> findAllOrderByCreatedAt();
}
