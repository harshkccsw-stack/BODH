package com.bodhpsychometric.bodhassess.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.bodhpsychometric.bodhassess.model.Instrument;

@Repository
public interface InstrumentRepository extends JpaRepository<Instrument, String> {
}
