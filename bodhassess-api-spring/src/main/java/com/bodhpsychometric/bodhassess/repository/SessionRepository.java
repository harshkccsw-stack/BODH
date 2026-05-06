package com.bodhpsychometric.bodhassess.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Session;

@Repository
public interface SessionRepository extends JpaRepository<Session, String> {
}
