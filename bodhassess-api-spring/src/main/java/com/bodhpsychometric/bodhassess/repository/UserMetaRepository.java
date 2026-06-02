package com.bodhpsychometric.bodhassess.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.UserMeta;

@Repository
public interface UserMetaRepository extends JpaRepository<UserMeta, String> {
}
