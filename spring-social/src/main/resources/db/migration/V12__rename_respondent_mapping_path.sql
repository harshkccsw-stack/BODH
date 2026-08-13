-- The dashboard's "Assessment Mapping" page became "Respondent Mapping", and
-- its route moved from /assessment-library/mapping to
-- /assessment-library/respondent-mapping.
--
-- Role permissions are stored AS PATHS (role_url_path.url_path, written by
-- the Roles & Users screen from the sidebar-derived page catalog), so the
-- route rename is a data change too: a role granted the old leaf would keep a
-- row nothing matches any more and silently lose the page, with the denial
-- screen giving no hint why. Wildcard grants like /assessment-library/* are
-- unaffected and need no rewriting.
--
-- Order matters. The primary key is (role_id, url_path), so a role holding
-- BOTH the old and the new path would break a plain UPDATE with a duplicate
-- key — drop the redundant old rows first, then rename what is left. Each
-- statement is a no-op when there is nothing to move, so this is safe on a
-- database that never had the old path.
DELETE old
FROM `role_url_path` old
JOIN `role_url_path` current
  ON current.`role_id` = old.`role_id`
 AND current.`url_path` = '/assessment-library/respondent-mapping'
WHERE old.`url_path` = '/assessment-library/mapping';

UPDATE `role_url_path`
SET `url_path` = '/assessment-library/respondent-mapping'
WHERE `url_path` = '/assessment-library/mapping';
