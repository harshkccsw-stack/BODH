package com.bodhpsychometric.bodhassess.security;

import java.util.Collection;
import java.util.Collections;
import java.util.List;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public class UserPrincipal implements UserDetails {

    private final String id;
    private final String email;
    private final UserType userType;
    private final List<String> roles;
    private final Collection<? extends GrantedAuthority> authorities;

    public enum UserType { PRACTITIONER, RESPONDENT, ADMIN }

    public UserPrincipal(String id, String email, UserType userType, List<String> roles) {
        this.id = id;
        this.email = email;
        this.userType = userType;
        this.roles = roles == null ? Collections.emptyList() : roles;
        this.authorities = buildAuthorities(userType, this.roles);
    }

    private static Collection<? extends GrantedAuthority> buildAuthorities(UserType userType, List<String> roles) {
        java.util.List<GrantedAuthority> out = new java.util.ArrayList<>();
        out.add(new SimpleGrantedAuthority("ROLE_" + userType.name()));
        for (String r : roles) {
            if (r != null && !r.isEmpty()) {
                out.add(new SimpleGrantedAuthority("ROLE_" + r.toUpperCase().replace(' ', '_')));
            }
        }
        return out;
    }

    public String getId() { return id; }
    public String getEmail() { return email; }
    public UserType getUserType() { return userType; }
    public List<String> getRoles() { return roles; }

    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return authorities; }
    @Override public String getPassword() { return null; }
    @Override public String getUsername() { return id; }
    @Override public boolean isAccountNonExpired() { return true; }
    @Override public boolean isAccountNonLocked() { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled() { return true; }
}
