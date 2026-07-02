package com.bodhpsychometric.bodhassess.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.bodhassess.payload.AdminLoginRequest;
import com.bodhpsychometric.bodhassess.payload.AdminLoginResponse;
import com.bodhpsychometric.bodhassess.security.CurrentUser;
import com.bodhpsychometric.bodhassess.security.UserPrincipal;
import com.bodhpsychometric.bodhassess.service.AdminService;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    @Autowired
    private AdminService service;

    @PostMapping("/login")
    public AdminLoginResponse login(@RequestBody AdminLoginRequest req) {
        return service.login(req);
    }

    @GetMapping("/me")
    public AdminLoginResponse.AdminInfo me(@CurrentUser UserPrincipal principal) {
        return service.me(principal);
    }

    // Stateless JWT — logout is a client concern (drop the token).
    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }
}
