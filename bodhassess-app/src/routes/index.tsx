import { lazy, Suspense, type ComponentType } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';
import { PractitionerAuthProvider } from '@/lib/practitioner-auth';
import { PrivateRoute } from '@/components/guards/private-route';
import { PublicRoute } from '@/components/guards/public-route';
import { AppShell } from '@/components/app-shell';

// Root mounts the auth provider once, above every route, so the same auth
// state survives navigation. Must live INSIDE the router because the provider
// uses useNavigate/useLocation under the hood.
function Root() {
  return (
    <PractitionerAuthProvider>
      <Outlet />
    </PractitionerAuthProvider>
  );
}

// Wrap a lazy import in <Suspense> so each route falls back to the screen
// loader independently while its bundle is being fetched. Returns a component
// built ONCE at module scope — creating lazy() inside render would mint a new
// component type per render, remounting the page (and dropping its state)
// whenever anything above the router re-renders.
function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(loader);
  return function Page() {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <Component />
      </Suspense>
    );
  };
}

// ── Public pages (no auth) ─────────────────────────────────────────────────
const HomePage           = lazyPage(() => import('@/pages/home'));
const LoginPage          = lazyPage(() => import('@/pages/login'));
const SelectVerticalPage = lazyPage(() => import('@/pages/select-vertical'));
const EntityRegistrationPage = lazyPage(() => import('@/pages/entity-registration'));
const EntityMemberRegister   = lazyPage(() => import('@/pages/entity-member-register'));
const RegisterWithToken      = lazyPage(() => import('@/pages/register-with-token'));

// ── Respondent portal (own auth, lives outside dashboard chrome) ──────────
// MOVED to the standalone bodhassess-portal app (served at portal.bodh.biz).
// Commented out (not deleted) so the cutover stays reversible. The take flow's
// gates now live inside that app's /portal/assessment/:sessionId route.
// const PortalLogin       = lazyPage(() => import('@/pages/portal/login'));
// const PortalAssessments = lazyPage(() => import('@/pages/portal/assessments'));
// const PortalTake        = lazyPage(() => import('@/pages/portal/take'));
// const PortalComplete    = lazyPage(() => import('@/pages/portal/complete'));
// /preview is the public questionnaire test-link (authoring tool) — kept here.
const PreviewQuestionnaire = lazyPage(() => import('@/pages/portal/preview'));

// ── Private pages (practitioner dashboard) ────────────────────────────────
const Dashboard          = lazyPage(() => import('@/pages/dashboard'));
const Analytics          = lazyPage(() => import('@/pages/analytics'));
const DataStudioHome     = lazyPage(() => import('@/pages/data-studio/index'));
const DataStudioWorkbook = lazyPage(() => import('@/pages/data-studio/workbook'));
const Survey             = lazyPage(() => import('@/pages/survey'));
const Qualities          = lazyPage(() => import('@/pages/MeasuredQuality/qualities'));

const AdminGroups        = lazyPage(() => import('@/pages/admin/groups'));
const AdminPermissions   = lazyPage(() => import('@/pages/admin/permissions'));
// New-dialect practitioners page wired to spring-social (/api/practitioners).
const AdminPractitioners = lazyPage(() => import('@/pages/Practitioner/practitioners'));
// New-dialect respondents page wired to spring-social (/api/respondents).
const AdminRespondents          = lazyPage(() => import('@/pages/Respondent/respondents'));
const AdminEntityRegistrations  = lazyPage(() => import('@/pages/admin/entity-registrations'));
const AdminEntityDrillIn        = lazyPage(() => import('@/pages/admin/entity-drill-in'));
const AdminRoles         = lazyPage(() => import('@/pages/admin/roles'));
const AdminLiveTracking  = lazyPage(() => import('@/pages/admin/live-tracking'));
const AdminDataGrid      = lazyPage(() => import('@/pages/admin/data-grid'));

const Assessments              = lazyPage(() => import('@/pages/assessments/all-assessments'));
// New-dialect catalog page wired to spring-social (Assessment Library group).
const AssessmentLibrary        = lazyPage(() => import('@/pages/assessments/assessment-library'));
const AssessmentsCreate        = lazyPage(() => import('@/pages/assessments/create-assessment'));
const AssessmentsEdit          = lazyPage(() => import('@/pages/assessments/edit-assessment'));
const AssessmentsBatch         = lazyPage(() => import('@/pages/assessments/batch-upload'));
const AssessmentsBrowse        = lazyPage(() => import('@/pages/assessments/browse-assessments'));
const AssessmentRespondents    = lazyPage(() => import('@/pages/assessments/assessment-respondents'));
const AssessmentInviteOrCopy   = lazyPage(() => import('@/pages/assessments/invite-or-copy'));
// Special — uses its own minimal layout, not the dashboard chrome.
const AssessmentTake    = lazyPage(() => import('@/pages/assessments/take-assessment'));

const ClinicalClients      = lazyPage(() => import('@/pages/clinical/clients'));
const ClinicalMseUpload    = lazyPage(() => import('@/pages/clinical/mse-upload'));
const ClinicalRiskAlerts   = lazyPage(() => import('@/pages/clinical/risk-alerts'));
const ClinicalTracking     = lazyPage(() => import('@/pages/clinical/tracking'));

const ComplianceAudit   = lazyPage(() => import('@/pages/compliance/audit'));
const ComplianceConsent = lazyPage(() => import('@/pages/compliance/consent'));
const ComplianceErasure = lazyPage(() => import('@/pages/compliance/erasure'));
const CompliancePortal  = lazyPage(() => import('@/pages/compliance/portal'));

const CounsellingConsent        = lazyPage(() => import('@/pages/counselling/consent'));
const CounsellingDevelopmental  = lazyPage(() => import('@/pages/counselling/developmental'));
const CounsellingMultiInformant = lazyPage(() => import('@/pages/counselling/multi-informant'));
const CounsellingStudents       = lazyPage(() => import('@/pages/counselling/students'));

const ExperimentsBuilder   = lazyPage(() => import('@/pages/experiments/builder'));
const ExperimentsExport    = lazyPage(() => import('@/pages/experiments/export'));
const ExperimentsParadigms = lazyPage(() => import('@/pages/experiments/paradigms'));

const IndustrialAiAdaptability = lazyPage(() => import('@/pages/industrial/ai-adaptability'));
const IndustrialCohorts        = lazyPage(() => import('@/pages/industrial/cohorts'));
const IndustrialCompetency     = lazyPage(() => import('@/pages/industrial/competency'));
const IndustrialProctoring     = lazyPage(() => import('@/pages/industrial/proctoring'));

const QuestionBank             = lazyPage(() => import('@/pages/question-bank/item-explorer'));
const QuestionBankQuestions    = lazyPage(() => import('@/pages/question-bank/questions'));
const QuestionBankCalibration  = lazyPage(() => import('@/pages/question-bank/calibration'));
const QuestionBankCreate       = lazyPage(() => import('@/pages/question-bank/create-questionnaire'));
const QuestionBankNorms        = lazyPage(() => import('@/pages/question-bank/norms'));

// One catalog page serves /questionnaires and the vertical-preset routes —
// it reads the pathname to pre-filter. Versioning (parents/versions) is gone.
const Questionnaires             = lazyPage(() => import('@/pages/questionnaires/all-questionnaires'));
const QuestionnairesDemographics = lazyPage(() => import('@/pages/questionnaires/demographics'));
const QuestionnairePreview       = lazyPage(() => import('@/pages/questionnaires/preview'));

const Reports             = lazyPage(() => import('@/pages/reports/all-reports'));
const ReportsResponses    = lazyPage(() => import('@/pages/reports/response-sheets'));
const ReportsClinical     = lazyPage(() => import('@/pages/reports/clinical'));
const ReportsCounselling  = lazyPage(() => import('@/pages/reports/counselling'));
const ReportsIndustrial   = lazyPage(() => import('@/pages/reports/industrial'));

const SettingsIntegrations = lazyPage(() => import('@/pages/settings/integrations'));
const SettingsTenant       = lazyPage(() => import('@/pages/settings/tenant'));
const SettingsTiers        = lazyPage(() => import('@/pages/settings/tiers'));

const WhiteLabelApi      = lazyPage(() => import('@/pages/white-label/api'));
const WhiteLabelBranding = lazyPage(() => import('@/pages/white-label/branding'));
const WhiteLabelTenants  = lazyPage(() => import('@/pages/white-label/tenants'));

// ── Route tree ────────────────────────────────────────────────────────────
// Top-level structure:
//   /                 → home (redirects to /dashboard)
//   /login, /register, /select-vertical → public-only (redirect to /dashboard if signed in)
//   /portal/*         → respondent portal (its own auth)
//   /assessments/:id/take → minimal layout (no dashboard chrome)
//   everything else   → PrivateRoute + AppShell (Layout1 with sidebar etc.)
const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: '/', element: <HomePage /> },

      // Public-only — bounce to /dashboard when already signed in
      {
        element: <PublicRoute />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/select-vertical', element: <SelectVerticalPage /> },
        ],
      },

      // Entity registration — public form, no auth required
      { path: '/entity-registration', element: <EntityRegistrationPage /> },

      // Entity member self-registration — public form behind an entity's
      // shareable member link. Resolves the entity by id to title the form,
      // registers the member into it, then hands off to the portal login.
      { path: '/entity/:entityId/register', element: <EntityMemberRegister /> },

      // Public, no-login questionnaire preview ("test link"). Renders a
      // version's content as a walkthrough; nothing is saved.
      { path: '/preview/:versionId', element: <PreviewQuestionnaire /> },

      // Registration entry point. With ?token=… it resolves the admin's
      // invite, skips the account-type picker, links the registrant to the
      // token's entity/group, and drops them into the assessment. Without a
      // token it falls back to ordinary self-signup.
      { path: '/register', element: <RegisterWithToken /> },

      // Respondent portal — MOVED to the standalone bodhassess-portal app
      // (served at portal.bodh.biz). Commented out here, not deleted, so the
      // cutover is reversible. NOTE: in-app redirects to /portal/* (login.tsx,
      // register-with-token.tsx, admin/respondents.tsx "Portal URL") now fall
      // through to the catch-all → /dashboard; retarget them to the portal
      // origin when finishing the decommission.
      // { path: '/portal/login', element: <PortalLogin /> },
      // { path: '/portal/assessments', element: <PortalAssessments /> },
      // { path: '/portal/take', element: <PortalTake /> },
      // { path: '/portal/complete', element: <PortalComplete /> },

  // Take-assessment view — private but uses its own minimal full-screen layout
  {
    path: '/assessments/:id/take',
    element: (
      <PrivateRoute>
        <div className="min-h-screen bg-background">
          <AssessmentTake />
        </div>
      </PrivateRoute>
    ),
  },

  // Private practitioner dashboard — wrapped in AppShell (Layout1 chrome)
  {
    element: (
      <PrivateRoute>
        <AppShell />
      </PrivateRoute>
    ),
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/analytics', element: <Analytics /> },
      { path: '/data-studio', element: <DataStudioHome /> },
      { path: '/data-studio/wb/:wid', element: <DataStudioWorkbook /> },
      { path: '/survey', element: <Survey /> },
      { path: '/question-bank/qualities', element: <Qualities /> },

      { path: '/admin/groups', element: <AdminGroups /> },
      { path: '/admin/permissions', element: <AdminPermissions /> },
      { path: '/admin/practitioners', element: <AdminPractitioners /> },
      { path: '/admin/respondents', element: <AdminRespondents /> },
      { path: '/admin/entity-registrations', element: <AdminEntityRegistrations /> },
      { path: '/admin/entity-registrations/:id', element: <AdminEntityDrillIn /> },
      { path: '/admin/roles', element: <AdminRoles /> },
      { path: '/admin/live-tracking', element: <AdminLiveTracking /> },
      { path: '/admin/data-grid', element: <AdminDataGrid /> },

      { path: '/assessment-library/assessments', element: <AssessmentLibrary /> },
      // { path: '/assessments', element: <Assessments /> },
      // { path: '/assessments/create', element: <AssessmentsCreate /> },
      { path: '/assessments/edit/:id', element: <AssessmentsEdit /> },
      { path: '/assessments/batch', element: <AssessmentsBatch /> },
      // Browse assessments grouped by the bulk-create group key + drill in
      // to that assessment's respondents. /respondents (literal) must come
      // before the /:assessmentId/respondents route so the literal wins.
      { path: '/assessments/respondents', element: <AssessmentsBrowse /> },
      { path: '/assessments/:assessmentId/respondents', element: <AssessmentRespondents /> },
      // Both modes use the same page; the component reads the path
      // suffix (/invite vs /copy-link) to pick its label and submit
      // behaviour.
      { path: '/assessments/:id/invite', element: <AssessmentInviteOrCopy /> },
      { path: '/assessments/:id/copy-link', element: <AssessmentInviteOrCopy /> },

      { path: '/clinical/clients', element: <ClinicalClients /> },
      { path: '/clinical/mse-upload', element: <ClinicalMseUpload /> },
      { path: '/clinical/risk-alerts', element: <ClinicalRiskAlerts /> },
      { path: '/clinical/tracking', element: <ClinicalTracking /> },

      { path: '/compliance/audit', element: <ComplianceAudit /> },
      { path: '/compliance/consent', element: <ComplianceConsent /> },
      { path: '/compliance/erasure', element: <ComplianceErasure /> },
      { path: '/compliance/portal', element: <CompliancePortal /> },

      { path: '/counselling/consent', element: <CounsellingConsent /> },
      { path: '/counselling/developmental', element: <CounsellingDevelopmental /> },
      { path: '/counselling/multi-informant', element: <CounsellingMultiInformant /> },
      { path: '/counselling/students', element: <CounsellingStudents /> },

      { path: '/experiments/builder', element: <ExperimentsBuilder /> },
      { path: '/experiments/export', element: <ExperimentsExport /> },
      { path: '/experiments/paradigms', element: <ExperimentsParadigms /> },

      { path: '/industrial/ai-adaptability', element: <IndustrialAiAdaptability /> },
      { path: '/industrial/cohorts', element: <IndustrialCohorts /> },
      { path: '/industrial/competency', element: <IndustrialCompetency /> },
      { path: '/industrial/proctoring', element: <IndustrialProctoring /> },

      { path: '/question-bank', element: <QuestionBank /> },
      { path: '/question-bank/questions', element: <QuestionBankQuestions /> },
      { path: '/question-bank/calibration', element: <QuestionBankCalibration /> },
      { path: '/question-bank/create', element: <QuestionBankCreate /> },
      { path: '/question-bank/norms', element: <QuestionBankNorms /> },

      { path: '/questionnaires', element: <Questionnaires /> },
      { path: '/questionnaires/clinical', element: <Questionnaires /> },
      { path: '/questionnaires/counselling', element: <Questionnaires /> },
      { path: '/questionnaires/demographics', element: <QuestionnairesDemographics /> },
      { path: '/questionnaires/:id/preview', element: <QuestionnairePreview /> },
      { path: '/questionnaires/experimental', element: <Questionnaires /> },
      { path: '/questionnaires/industrial', element: <Questionnaires /> },

      { path: '/reports', element: <Reports /> },
      { path: '/reports/responses', element: <ReportsResponses /> },
      { path: '/reports/clinical', element: <ReportsClinical /> },
      { path: '/reports/counselling', element: <ReportsCounselling /> },
      { path: '/reports/industrial', element: <ReportsIndustrial /> },

      { path: '/settings/integrations', element: <SettingsIntegrations /> },
      { path: '/settings/tenant', element: <SettingsTenant /> },
      { path: '/settings/tiers', element: <SettingsTiers /> },

      { path: '/white-label/api', element: <WhiteLabelApi /> },
      { path: '/white-label/branding', element: <WhiteLabelBranding /> },
      { path: '/white-label/tenants', element: <WhiteLabelTenants /> },
    ],
  },

      // Catch-all — anything we don't recognise goes back to the dashboard.
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  basename: import.meta.env.VITE_BASE_PATH || '/',
});
