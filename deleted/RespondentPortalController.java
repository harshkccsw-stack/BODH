package com.bodhpsychometric.controller.portal;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RequestMapping("/api/portal")
@RestController
public class RespondentPortalController {

    @PostMapping("/authenticate")
    public ResponseEntity<?> authenticateRespondent(String respondentEmail, String password) {

         
        // Implement authentication logic here
        return ResponseEntity.ok("Respondent authenticated successfully");
    }
    
}
