package com.bodhpsychometric.repository.question;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.question.Question;

public interface QuestionRepository extends JpaRepository<Question, Long> {

}
