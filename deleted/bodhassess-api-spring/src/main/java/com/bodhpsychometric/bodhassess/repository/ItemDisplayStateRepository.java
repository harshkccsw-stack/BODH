package com.bodhpsychometric.bodhassess.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.ItemDisplayState;

@Repository
public interface ItemDisplayStateRepository extends JpaRepository<ItemDisplayState, String> {
}
