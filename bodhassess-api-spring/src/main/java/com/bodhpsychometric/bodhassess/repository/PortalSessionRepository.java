package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.PortalSession;

@Repository
public interface PortalSessionRepository extends JpaRepository<PortalSession, String> {

    @Query("SELECT s FROM PortalSession s ORDER BY s.createdAt DESC")
    List<PortalSession> findAllOrderByCreated();

    @Query("SELECT s FROM PortalSession s WHERE s.respondentId = :rid ORDER BY s.createdAt DESC")
    List<PortalSession> findByRespondentId(@Param("rid") String rid);
}
