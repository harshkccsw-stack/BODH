package com.bodhpsychometric.bodhassess.domain.service;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.bodhassess.domain.people.Role;
import com.bodhpsychometric.bodhassess.domain.people.User;
import com.bodhpsychometric.bodhassess.domain.people.UserRole;
import com.bodhpsychometric.bodhassess.domain.people.UserStatus;
import com.bodhpsychometric.bodhassess.domain.repository.RoleRepository;
import com.bodhpsychometric.bodhassess.domain.repository.UserRepository;
import com.bodhpsychometric.bodhassess.domain.repository.UserRoleRepository;

/**
 * One identity for every actor. Role names are data (seeded admin /
 * practitioner / respondent); assignment goes through here so the
 * one-row-per-pair rule stays in one place.
 */
@Service
@Transactional
public class UserService {

    public static final String ROLE_ADMIN = "admin";
    public static final String ROLE_PRACTITIONER = "practitioner";
    public static final String ROLE_RESPONDENT = "respondent";

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final UserRoleRepository userRoleRepository;

    public UserService(UserRepository userRepository,
                       RoleRepository roleRepository,
                       UserRoleRepository userRoleRepository) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.userRoleRepository = userRoleRepository;
    }

    public User createUser(String email, String name, LocalDate dob, String phone, String gender,
                           boolean consent, List<String> roleNames) {
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("A user with email " + email + " already exists");
        }
        User user = new User();
        user.setEmail(email);
        user.setName(name);
        user.setDob(dob);
        user.setPhone(phone);
        user.setGender(gender);
        user.setConsent(consent);
        if (consent) user.setConsentedAt(OffsetDateTime.now());
        User saved = userRepository.save(user);
        if (roleNames != null) {
            for (String roleName : roleNames) {
                assignRole(saved.getId(), roleName);
            }
        }
        return saved;
    }

    public User updateProfile(Long userId, String name, String phone, String gender, LocalDate dob) {
        User user = liveUser(userId);
        user.setName(name);
        user.setPhone(phone);
        user.setGender(gender);
        user.setDob(dob);
        return user;
    }

    public User setStatus(Long userId, UserStatus status) {
        User user = liveUser(userId);
        user.setStatus(status);
        return user;
    }

    public User recordConsent(Long userId, boolean consent) {
        User user = liveUser(userId);
        user.setConsent(consent);
        user.setConsentedAt(consent ? OffsetDateTime.now() : null);
        return user;
    }

    public UserRole assignRole(Long userId, String roleName) {
        User user = liveUser(userId);
        Role role = roleRepository.findByName(roleName)
                .orElseThrow(() -> new NotFoundException("Role", roleName));
        if (userRoleRepository.existsByUserIdAndRoleId(userId, role.getId())) {
            throw new ConflictException("User " + userId + " already has role " + roleName);
        }
        UserRole userRole = new UserRole();
        userRole.setUser(user);
        userRole.setRole(role);
        return userRoleRepository.save(userRole);
    }

    public void revokeRole(Long userId, String roleName) {
        Role role = roleRepository.findByName(roleName)
                .orElseThrow(() -> new NotFoundException("Role", roleName));
        UserRole userRole = userRoleRepository.findByUserIdAndRoleId(userId, role.getId())
                .orElseThrow(() -> new NotFoundException("UserRole", userId + "/" + roleName));
        userRoleRepository.delete(userRole);
    }

    public void binUser(Long userId) {
        liveUser(userId).moveToBin(OffsetDateTime.now());
    }

    public void restoreUser(Long userId) {
        userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User", userId))
                .restoreFromBin();
    }

    @Transactional(readOnly = true)
    public User get(Long userId) {
        return liveUser(userId);
    }

    @Transactional(readOnly = true)
    public User getByEmail(String email) {
        return userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull(email)
                .orElseThrow(() -> new NotFoundException("User", email));
    }

    @Transactional(readOnly = true)
    public List<User> byRole(String roleName) {
        return userRepository.findByRoleName(roleName);
    }

    private User liveUser(Long id) {
        return userRepository.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new NotFoundException("User", id));
    }
}
