// Canonical access-provisioning catalogues for Entity Management.
//
// An entity (company) is provisioned with an allow-list of the psychology
// verticals and platform modules it may use, plus the specific assessments
// it may run. These labels mirror the dashboard's own verticals (see the
// "Verticals" mega-menu group) and platform features (the "Assessments" core
// group) so what an admin grants here maps 1:1 to what the entity sees.
//
// Stored on EntityRegistration as plain string allow-lists; shared here so
// the registrations list and the entity drill-in render the same options.

export const ENTITY_VERTICALS = [
  'Clinical Psychology',
  'Industrial Psychology',
  'Counselling & Child',
  'Designing Experiments',
  'White-Label',
] as const;

export const ENTITY_PLATFORM_MODULES = [
  'Assessments',
  'Questionnaire Library',
  'Question Bank',
  'Reports',
  'BodhLens Analytics',
  'Data Studio',
  'BodhSurvey',
] as const;
