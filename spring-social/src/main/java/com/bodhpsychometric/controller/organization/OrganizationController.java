package com.bodhpsychometric.controller.organization;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.dto.OrganizationResponse;
import com.bodhpsychometric.repository.organization.OrganizationRepository;

/**
 * Read-only for now — just feeds the organization pickers on the respondent
 * (and later practitioner) forms. Full org CRUD is a separate flow.
 */
@RestController
@RequestMapping("/api/organizations")
@Transactional
public class OrganizationController {

    @Autowired
    private OrganizationRepository organizationRepository;

    @GetMapping("/getAll")
    public List<OrganizationResponse> getAllOrganizations() {
        return organizationRepository.findAll().stream()
                .map(OrganizationResponse::from)
                .toList();
    }
}
