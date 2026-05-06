package com.bodhpsychometric.bodhassess.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Item;

@Repository
public interface ItemRepository extends JpaRepository<Item, String> {
}
