package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.AuditLogEntry;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntry, Long> {

    @Query("SELECT a FROM AuditLogEntry a WHERE a.targetType = :type AND a.targetId = :id ORDER BY a.createdAt DESC")
    List<AuditLogEntry> findByTarget(@Param("type") String targetType, @Param("id") String targetId);

    @Query("SELECT a FROM AuditLogEntry a ORDER BY a.createdAt DESC")
    List<AuditLogEntry> findAllRecent();
}
