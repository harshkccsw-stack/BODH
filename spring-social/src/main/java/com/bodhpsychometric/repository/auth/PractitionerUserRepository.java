
package com.bodhpsychometric.repository.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.auth.PractitionerUser;

public interface PractitionerUserRepository extends JpaRepository<PractitionerUser, Long> {

   
}
