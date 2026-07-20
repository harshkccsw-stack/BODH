package com.bodhpsychometric.security;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.bodhpsychometric.model.auth.User;
import com.bodhpsychometric.repository.UserRepository;

/**
 * Who may call the API.
 *
 * Under the current regime a RoleGroup's paths are FRONTEND routes — they
 * decide what the dashboard renders, not what the server accepts. So the
 * check here is deliberately an identity check only: the caller must be a
 * real, live, active account. Per-endpoint authorisation is a later phase.
 *
 * That means any authenticated user can currently reach any endpoint. It is a
 * chosen position, not an oversight, and this class stays so there is one
 * obvious place to add the real rules when the API gets guarded.
 */
@Service
public class AccessControlService {

    private final UserRepository userRepository;

    public AccessControlService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public boolean mayAccess(Long userId, String path) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId).orElse(null);
        return user != null && user.isAccountStatus();
    }
}
