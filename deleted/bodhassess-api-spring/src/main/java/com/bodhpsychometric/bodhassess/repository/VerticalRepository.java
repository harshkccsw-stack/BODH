package com.bodhpsychometric.bodhassess.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Vertical;

@Repository
public interface VerticalRepository extends JpaRepository<Vertical, String> {

    @Query("SELECT v FROM Vertical v ORDER BY v.name")
    List<Vertical> findAllOrderByName();
}
