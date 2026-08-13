-- Self-registration links: one row per minted token, targeting EITHER a whole
-- organization OR a single entry of that organization's assessment catalog.
--
-- Which of the two FK columns is populated is the discriminator, and it is
-- also what makes "no duplicate links" two ordinary unique keys instead of an
-- expression index or a sentinel value:
--
--   * uqRtOrganization (organization_id) — at most one org-wide link per
--     organization. Assessment-scoped rows leave organization_id NULL, and
--     MySQL's never-equal NULLs put every one of them outside this key. That
--     is the correct reading here, not a loophole: a unique key over a
--     nullable column constrains exactly the rows where the column is
--     present, which is precisely the set the rule is about.
--
--   * uqRtOrganizationAssessmentMapping (organization_assessment_mapping_id) —
--     at most one link per catalog entry, the mirror of the above. Because
--     uqOamOrganizationAssessment already makes (organization, assessment)
--     unique, "one link per assessment per organization" falls out of a key
--     that already exists rather than being a second rule to keep in sync.
--
--   * ckRtScope — the row must target exactly one of the two. Without it a
--     row with both columns NULL would slip past both unique keys (they see
--     only non-NULL values), and a row with both set would claim two targets.
--     MySQL enforces CHECK constraints from 8.0.16; this database is 8.0.46.
--
-- The organization is deliberately NOT repeated on assessment-scoped rows:
-- the mapping row already carries it, and a second copy is a second source of
-- truth that can drift from the first.
--
-- `token` is the whole credential — it travels in the URL and is all that
-- stands between a stranger and an account. Two consequences in the DDL:
--   * ascii + ascii_bin, NOT the table's utf8mb4_0900_ai_ci. That collation
--     is case-INSENSITIVE, under which "aB…" and "Ab…" would be the same
--     token: the unique key would reject distinct tokens, and worse, a lookup
--     would match a wrong-case guess. Base64url is case-sensitive ASCII, so
--     the column must compare byte-for-byte.
--   * varchar(43) — 32 bytes of SecureRandom in Base64url without padding.
--
-- Nothing to backfill: no link has ever existed, so every existing row
-- legitimately has none.
--
-- Guard: CREATE TABLE IF NOT EXISTS makes this a no-op if a previous run (or
-- a manual patch) already created the table. MySQL commits DDL implicitly and
-- cannot roll it back, so a re-run has to be safe rather than merely unlikely.
CREATE TABLE IF NOT EXISTS `registration_token` (
  `registration_token_id`              bigint      NOT NULL AUTO_INCREMENT,
  `token`                              varchar(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `organization_id`                    bigint      DEFAULT NULL,
  `organization_assessment_mapping_id` bigint      DEFAULT NULL,
  `status`                             enum('ACTIVE','INACTIVE') NOT NULL,
  `max_uses`                           int         DEFAULT NULL,
  `used_count`                         int         NOT NULL DEFAULT 0,
  `expires_at`                         datetime(6) DEFAULT NULL,
  `created_at`                         datetime(6) NOT NULL,
  PRIMARY KEY (`registration_token_id`),
  UNIQUE KEY `uqRtToken` (`token`),
  UNIQUE KEY `uqRtOrganization` (`organization_id`),
  UNIQUE KEY `uqRtOrganizationAssessmentMapping` (`organization_assessment_mapping_id`),
  CONSTRAINT `ckRtScope` CHECK (
        (`organization_id` IS NOT NULL AND `organization_assessment_mapping_id` IS NULL)
     OR (`organization_id` IS NULL     AND `organization_assessment_mapping_id` IS NOT NULL)),
  CONSTRAINT `fkRtOrganization` FOREIGN KEY (`organization_id`)
      REFERENCES `organization` (`organization_id`),
  CONSTRAINT `fkRtOrganizationAssessmentMapping` FOREIGN KEY (`organization_assessment_mapping_id`)
      REFERENCES `organization_assessment_mapping` (`organization_assessment_mapping_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Both FKs are served by the unique keys above, so no extra KEY is needed and
-- there is no errno 1553 risk here — nothing is being dropped.
--
-- The FKs are RESTRICT (the project default): deleting an organization or
-- unmapping an assessment while a link points at it fails loudly rather than
-- silently taking the link with it. OrganizationController clears the links
-- first, the same way it already clears catalog rows before deleting an org.
