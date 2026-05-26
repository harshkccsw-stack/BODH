package com.bodhpsychometric.bodhassess.model;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;

import javax.persistence.CollectionTable;
import javax.persistence.Column;
import javax.persistence.ElementCollection;
import javax.persistence.Entity;
import javax.persistence.FetchType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.Table;

@Entity
@Table(name = "practitioners")
public class Practitioner {

    @Id
    private String id;

    private String name;

    private String email;

    private String phone;

    // Roles and verticals live in dedicated join tables so they're queryable
    // ("which practitioners have role X") and indexable, instead of opaque
    // JSON. Set (not List) sidesteps Hibernate's MultipleBagFetchException
    // for two eager collections on the same entity.
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "practitioner_roles",
            joinColumns = @JoinColumn(name = "practitioner_id"))
    @Column(name = "role", nullable = false, length = 255)
    private Set<String> roles = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "practitioner_verticals",
            joinColumns = @JoinColumn(name = "practitioner_id"))
    @Column(name = "vertical", nullable = false, length = 255)
    private Set<String> verticals = new HashSet<>();

    private String status;

    @Column(name = "last_login")
    private String lastLogin;

    private LocalDate dob;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public Set<String> getRoles() { return roles; }
    public void setRoles(Set<String> roles) { this.roles = roles; }
    public Set<String> getVerticals() { return verticals; }
    public void setVerticals(Set<String> verticals) { this.verticals = verticals; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getLastLogin() { return lastLogin; }
    public void setLastLogin(String lastLogin) { this.lastLogin = lastLogin; }
    public LocalDate getDob() { return dob; }
    public void setDob(LocalDate dob) { this.dob = dob; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
