package com.bodhpsychometric.repository.question;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.question.Option;

public interface OptionRepository extends JpaRepository<Option, Long> {

}
