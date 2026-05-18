package com.bodhpsychometric.bodhassess.model;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.Id;
import javax.persistence.Table;

import org.hibernate.annotations.Type;
import org.hibernate.annotations.TypeDef;

import com.vladmihalcea.hibernate.type.json.JsonStringType;

@Entity
@Table(name = "practitioners")
@TypeDef(name = "json", typeClass = JsonStringType.class)
public class Practitioner {

    @Id
    private String id;

    private String name;

    private String email;

    private String phone;

    @Type(type = "json")
    @Column(name = "roles", columnDefinition = "json")
    private List<String> roles = new ArrayList<>();

    @Type(type = "json")
    @Column(columnDefinition = "json")
    private List<String> verticals = new ArrayList<>();

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
    public List<String> getRoles() { return roles; }
    public void setRoles(List<String> roles) { this.roles = roles; }
    public List<String> getVerticals() { return verticals; }
    public void setVerticals(List<String> verticals) { this.verticals = verticals; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getLastLogin() { return lastLogin; }
    public void setLastLogin(String lastLogin) { this.lastLogin = lastLogin; }
    public LocalDate getDob() { return dob; }
    public void setDob(LocalDate dob) { this.dob = dob; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
