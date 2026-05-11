package com.bodhpsychometric.bodhassess.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.QuestionnaireCatalog;

@Repository
public interface QuestionnaireCatalogRepository extends JpaRepository<QuestionnaireCatalog, String> {
}
