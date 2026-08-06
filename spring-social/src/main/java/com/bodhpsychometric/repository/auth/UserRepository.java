
package com.bodhpsychometric.repository.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.auth.User;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    /** Pre-checks for the unique email — never catch the flush instead. */
    boolean existsByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCaseAndIdNot(String email, Long id);

    /** Guard for revoke: the platform must never end up with zero superadmins. */
    long countBySuperAdminTrue();

    /** Delete guard for a role group: is anyone still holding it? */
    long countByRoleGroup_RoleGroupId(Long roleGroupId);

    /**
     * Everyone who can open the dashboard — the same gate DashboardAuthService
     * applies at login (a practitioner profile, or the superadmin flag), so
     * the assign screen lists exactly the people a group would affect.
     * Respondent-only identities are excluded: they sign in at the portal,
     * which never consults the role system.
     */
    @Query("select u from User u left join fetch u.roleGroup "
            + "where u.superAdmin = true "
            + "or exists (select p from PractitionerUser p where p.user = u) "
            + "order by u.email")
    List<User> findDashboardUsers();

}
