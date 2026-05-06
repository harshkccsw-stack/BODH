package com.bodhpsychometric.bodhassess.payload;

import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PractitionerDto {
    private String id;
    private String name;
    private String email;
    private List<String> roles = new ArrayList<>();
    private List<String> verticals = new ArrayList<>();
    private String status;
    @JsonProperty("last_login")
    private String lastLogin;
    private String dob;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public List<String> getRoles() { return roles; }
    public void setRoles(List<String> roles) { this.roles = roles; }
    public List<String> getVerticals() { return verticals; }
    public void setVerticals(List<String> verticals) { this.verticals = verticals; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getLastLogin() { return lastLogin; }
    public void setLastLogin(String lastLogin) { this.lastLogin = lastLogin; }
    public String getDob() { return dob; }
    public void setDob(String dob) { this.dob = dob; }
}
