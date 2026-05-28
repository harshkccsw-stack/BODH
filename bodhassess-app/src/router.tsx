import { lazy, Suspense, type ComponentType } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router';
import { ScreenLoader } from '@/components/screen-loader';
import { PractitionerAuthProvider } from '@/lib/practitioner-auth';
import { PrivateRoute } from '@/src/components/private-route';
import { PublicRoute } from '@/src/components/public-route';
import { AppShell } from '@/src/components/app-shell';

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
// loader independently while its bundle is being fetched.
function lazyPage(loader: () => Promise<{ default: ComponentType }>) {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Component />
    </Suspense>
  );
}

// ── Public pages (no auth) ─────────────────────────────────────────────────
const HomePage           = () => lazyPage(() => import('@/src/pages/home'));
const LoginPage          = () => lazyPage(() => import('@/src/pages/login'));
const RegisterPage       = () => lazyPage(() => import('@/src/pages/register'));
const SelectVerticalPage = () => lazyPage(() => import('@/src/pages/select-vertical'));
const EntityRegistrationPage = () => lazyPage(() => import('@/src/pages/entity-registration'));

// ── Respondent portal (own auth, lives outside dashboard chrome) ──────────
const PortalLogin       = () => lazyPage(() => import('@/src/pages/portal/login'));
const PortalAssessments = () => lazyPage(() => import('@/src/pages/portal/assessments'));
const PortalTake        = () => lazyPage(() => import('@/src/pages/portal/take'));
const PortalComplete    = () => lazyPage(() => import('@/src/pages/portal/complete'));

// ── Private pages (practitioner dashboard) ────────────────────────────────
const Dashboard          = () => lazyPage(() => import('@/src/pages/dashboard'));
const Analytics          = () => lazyPage(() => import('@/src/pages/analytics'));
const Survey             = () => lazyPage(() => import('@/src/pages/survey'));
const Qualities          = () => lazyPage(() => import('@/src/pages/qualities'));

const AdminGroups        = () => lazyPage(() => import('@/src/pages/admin/groups'));
const AdminPermissions   = () => lazyPage(() => import('@/src/pages/admin/permissions'));
const AdminPractitioners = () => lazyPage(() => import('@/src/pages/admin/practitioners'));
const AdminRespondents          = () => lazyPage(() => import('@/src/pages/admin/respondents'));
const AdminEntityRegistrations  = () => lazyPage(() => import('@/src/pages/admin/entity-registrations'));
const AdminRoles         = () => lazyPage(() => import('@/src/pages/admin/roles'));
const AdminLiveTracking  = () => lazyPage(() => import('@/src/pages/admin/live-tracking'));

const Assessments       = () => lazyPage(() => import('@/src/pages/assessments/all-assessments'));
const AssessmentsCreate = () => lazyPage(() => import('@/src/pages/assessments/create-assessment'));
const AssessmentsBatch  = () => lazyPage(() => import('@/src/pages/assessments/batch-upload'));
// Special — uses its own minimal layout, not the dashboard chrome.
const AssessmentTake    = () => lazyPage(() => import('@/src/pages/assessments/take-assessment'));

const ClinicalClients      = () => lazyPage(() => import('@/src/pages/clinical/clients'));
const ClinicalMseUpload    = () => lazyPage(() => import('@/src/pages/clinical/mse-upload'));
const ClinicalRiskAlerts   = () => lazyPage(() => import('@/src/pages/clinical/risk-alerts'));
const ClinicalTracking     = () => lazyPage(() => import('@/src/pages/clinical/tracking'));

const ComplianceAudit   = () => lazyPage(() => import('@/src/pages/compliance/audit'));
const ComplianceConsent = () => lazyPage(() => import('@/src/pages/compliance/consent'));
const ComplianceErasure = () => lazyPage(() => import('@/src/pages/compliance/erasure'));
const CompliancePortal  = () => lazyPage(() => import('@/src/pages/compliance/portal'));

const CounsellingConsent        = () => lazyPage(() => import('@/src/pages/counselling/consent'));
const CounsellingDevelopmental  = () => lazyPage(() => import('@/src/pages/counselling/developmental'));
const CounsellingMultiInformant = () => lazyPage(() => import('@/src/pages/counselling/multi-informant'));
const CounsellingStudents       = () => lazyPage(() => import('@/src/pages/counselling/students'));

const ExperimentsBuilder   = () => lazyPage(() => import('@/src/pages/experiments/builder'));
const ExperimentsExport    = () => lazyPage(() => import('@/src/pages/experiments/export'));
const ExperimentsParadigms = () => lazyPage(() => import('@/src/pages/experiments/paradigms'));

const IndustrialAiAdaptability = () => lazyPage(() => import('@/src/pages/industrial/ai-adaptability'));
const IndustrialCohorts        = () => lazyPage(() => import('@/src/pages/industrial/cohorts'));
const IndustrialCompetency     = () => lazyPage(() => import('@/src/pages/industrial/competency'));
const IndustrialProctoring     = () => lazyPage(() => import('@/src/pages/industrial/proctoring'));

const QuestionBank             = () => lazyPage(() => import('@/src/pages/question-bank/item-explorer'));
const QuestionBankCalibration  = () => lazyPage(() => import('@/src/pages/question-bank/calibration'));
const QuestionBankCreate       = () => lazyPage(() => import('@/src/pages/question-bank/create-questionnaire'));
const QuestionBankNorms        = () => lazyPage(() => import('@/src/pages/question-bank/norms'));

const Questionnaires             = () => lazyPage(() => import('@/src/pages/questionnaires/all-questionnaires'));
const QuestionnairesClinical     = () => lazyPage(() => import('@/src/pages/questionnaires/clinical'));
const QuestionnairesCounselling  = () => lazyPage(() => import('@/src/pages/questionnaires/counselling'));
const QuestionnairesDemographics = () => lazyPage(() => import('@/src/pages/questionnaires/demographics'));
const QuestionnairesExperimental = () => lazyPage(() => import('@/src/pages/questionnaires/experimental'));
const QuestionnairesIndustrial   = () => lazyPage(() => import('@/src/pages/questionnaires/industrial'));

const Reports             = () => lazyPage(() => import('@/src/pages/reports/all-reports'));
const ReportsClinical     = () => lazyPage(() => import('@/src/pages/reports/clinical'));
const ReportsCounselling  = () => lazyPage(() => import('@/src/pages/reports/counselling'));
const ReportsIndustrial   = () => lazyPage(() => import('@/src/pages/reports/industrial'));

const SettingsIntegrations = () => lazyPage(() => import('@/src/pages/settings/integrations'));
const SettingsTenant       = () => lazyPage(() => import('@/src/pages/settings/tenant'));
const SettingsTiers        = () => lazyPage(() => import('@/src/pages/settings/tiers'));

const WhiteLabelApi      = () => lazyPage(() => import('@/src/pages/white-label/api'));
const WhiteLabelBranding = () => lazyPage(() => import('@/src/pages/white-label/branding'));
const WhiteLabelTenants  = () => lazyPage(() => import('@/src/pages/white-label/tenants'));

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
          { path: '/register', element: <RegisterPage /> },
          { path: '/select-vertical', element: <SelectVerticalPage /> },
        ],
      },

      // Entity registration — public form, no auth required
      { path: '/entity-registration', element: <EntityRegistrationPage /> },

      // Respondent portal — handles its own auth via portal-specific tokens
      { path: '/portal/login', element: <PortalLogin /> },
      { path: '/portal/assessments', element: <PortalAssessments /> },
      { path: '/portal/take', element: <PortalTake /> },
      { path: '/portal/complete', element: <PortalComplete /> },

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
      { path: '/survey', element: <Survey /> },
      { path: '/question-bank/qualities', element: <Qualities /> },

      { path: '/admin/groups', element: <AdminGroups /> },
      { path: '/admin/permissions', element: <AdminPermissions /> },
      { path: '/admin/practitioners', element: <AdminPractitioners /> },
      { path: '/admin/respondents', element: <AdminRespondents /> },
      { path: '/admin/entity-registrations', element: <AdminEntityRegistrations /> },
      { path: '/admin/roles', element: <AdminRoles /> },
      { path: '/admin/live-tracking', element: <AdminLiveTracking /> },

      { path: '/assessments', element: <Assessments /> },
      { path: '/assessments/create', element: <AssessmentsCreate /> },
      { path: '/assessments/batch', element: <AssessmentsBatch /> },

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
      { path: '/question-bank/calibration', element: <QuestionBankCalibration /> },
      { path: '/question-bank/create', element: <QuestionBankCreate /> },
      { path: '/question-bank/norms', element: <QuestionBankNorms /> },

      { path: '/questionnaires', element: <Questionnaires /> },
      { path: '/questionnaires/clinical', element: <QuestionnairesClinical /> },
      { path: '/questionnaires/counselling', element: <QuestionnairesCounselling /> },
      { path: '/questionnaires/demographics', element: <QuestionnairesDemographics /> },
      { path: '/questionnaires/experimental', element: <QuestionnairesExperimental /> },
      { path: '/questionnaires/industrial', element: <QuestionnairesIndustrial /> },

      { path: '/reports', element: <Reports /> },
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
