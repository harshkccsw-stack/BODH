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
const HomePage           = () => lazyPage(() => import('@/app/page'));
const LoginPage          = () => lazyPage(() => import('@/app/login/page'));
const RegisterPage       = () => lazyPage(() => import('@/app/register/page'));
const SelectVerticalPage = () => lazyPage(() => import('@/app/select-vertical/page'));

// ── Respondent portal (own auth, lives outside dashboard chrome) ──────────
const PortalLogin       = () => lazyPage(() => import('@/app/portal/login/page'));
const PortalAssessments = () => lazyPage(() => import('@/app/portal/assessments/page'));
const PortalTake        = () => lazyPage(() => import('@/app/portal/take/page'));
const PortalComplete    = () => lazyPage(() => import('@/app/portal/complete/page'));

// ── Private pages (practitioner dashboard) ────────────────────────────────
const Dashboard          = () => lazyPage(() => import('@/app/(app)/dashboard/page'));
const Analytics          = () => lazyPage(() => import('@/app/(app)/analytics/page'));
const Survey             = () => lazyPage(() => import('@/app/(app)/survey/page'));
const Qualities          = () => lazyPage(() => import('@/app/(app)/qualities/page'));

const AdminGroups        = () => lazyPage(() => import('@/app/(app)/admin/groups/page'));
const AdminPermissions   = () => lazyPage(() => import('@/app/(app)/admin/permissions/page'));
const AdminPractitioners = () => lazyPage(() => import('@/app/(app)/admin/practitioners/page'));
const AdminRespondents   = () => lazyPage(() => import('@/app/(app)/admin/respondents/page'));
const AdminRoles         = () => lazyPage(() => import('@/app/(app)/admin/roles/page'));

const Assessments       = () => lazyPage(() => import('@/app/(app)/assessments/page'));
const AssessmentsCreate = () => lazyPage(() => import('@/app/(app)/assessments/create/page'));
const AssessmentsBatch  = () => lazyPage(() => import('@/app/(app)/assessments/batch/page'));
// Special — uses its own minimal layout, not the dashboard chrome.
const AssessmentTake    = () => lazyPage(() => import('@/app/(app)/assessments/[id]/take/page'));

const ClinicalClients      = () => lazyPage(() => import('@/app/(app)/clinical/clients/page'));
const ClinicalMseUpload    = () => lazyPage(() => import('@/app/(app)/clinical/mse-upload/page'));
const ClinicalRiskAlerts   = () => lazyPage(() => import('@/app/(app)/clinical/risk-alerts/page'));
const ClinicalTracking     = () => lazyPage(() => import('@/app/(app)/clinical/tracking/page'));

const ComplianceAudit   = () => lazyPage(() => import('@/app/(app)/compliance/audit/page'));
const ComplianceConsent = () => lazyPage(() => import('@/app/(app)/compliance/consent/page'));
const ComplianceErasure = () => lazyPage(() => import('@/app/(app)/compliance/erasure/page'));
const CompliancePortal  = () => lazyPage(() => import('@/app/(app)/compliance/portal/page'));

const CounsellingConsent        = () => lazyPage(() => import('@/app/(app)/counselling/consent/page'));
const CounsellingDevelopmental  = () => lazyPage(() => import('@/app/(app)/counselling/developmental/page'));
const CounsellingMultiInformant = () => lazyPage(() => import('@/app/(app)/counselling/multi-informant/page'));
const CounsellingStudents       = () => lazyPage(() => import('@/app/(app)/counselling/students/page'));

const ExperimentsBuilder   = () => lazyPage(() => import('@/app/(app)/experiments/builder/page'));
const ExperimentsExport    = () => lazyPage(() => import('@/app/(app)/experiments/export/page'));
const ExperimentsParadigms = () => lazyPage(() => import('@/app/(app)/experiments/paradigms/page'));

const IndustrialAiAdaptability = () => lazyPage(() => import('@/app/(app)/industrial/ai-adaptability/page'));
const IndustrialCohorts        = () => lazyPage(() => import('@/app/(app)/industrial/cohorts/page'));
const IndustrialCompetency     = () => lazyPage(() => import('@/app/(app)/industrial/competency/page'));
const IndustrialProctoring     = () => lazyPage(() => import('@/app/(app)/industrial/proctoring/page'));

const QuestionBank             = () => lazyPage(() => import('@/app/(app)/question-bank/page'));
const QuestionBankCalibration  = () => lazyPage(() => import('@/app/(app)/question-bank/calibration/page'));
const QuestionBankCreate       = () => lazyPage(() => import('@/app/(app)/question-bank/create/page'));
const QuestionBankNorms        = () => lazyPage(() => import('@/app/(app)/question-bank/norms/page'));

const Questionnaires             = () => lazyPage(() => import('@/app/(app)/questionnaires/page'));
const QuestionnairesClinical     = () => lazyPage(() => import('@/app/(app)/questionnaires/clinical/page'));
const QuestionnairesCounselling  = () => lazyPage(() => import('@/app/(app)/questionnaires/counselling/page'));
const QuestionnairesDemographics = () => lazyPage(() => import('@/app/(app)/questionnaires/demographics/page'));
const QuestionnairesExperimental = () => lazyPage(() => import('@/app/(app)/questionnaires/experimental/page'));
const QuestionnairesIndustrial   = () => lazyPage(() => import('@/app/(app)/questionnaires/industrial/page'));

const Reports             = () => lazyPage(() => import('@/app/(app)/reports/page'));
const ReportsClinical     = () => lazyPage(() => import('@/app/(app)/reports/clinical/page'));
const ReportsCounselling  = () => lazyPage(() => import('@/app/(app)/reports/counselling/page'));
const ReportsIndustrial   = () => lazyPage(() => import('@/app/(app)/reports/industrial/page'));

const SettingsIntegrations = () => lazyPage(() => import('@/app/(app)/settings/integrations/page'));
const SettingsTenant       = () => lazyPage(() => import('@/app/(app)/settings/tenant/page'));
const SettingsTiers        = () => lazyPage(() => import('@/app/(app)/settings/tiers/page'));

const WhiteLabelApi      = () => lazyPage(() => import('@/app/(app)/white-label/api/page'));
const WhiteLabelBranding = () => lazyPage(() => import('@/app/(app)/white-label/branding/page'));
const WhiteLabelTenants  = () => lazyPage(() => import('@/app/(app)/white-label/tenants/page'));

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
      { path: '/qualities', element: <Qualities /> },

      { path: '/admin/groups', element: <AdminGroups /> },
      { path: '/admin/permissions', element: <AdminPermissions /> },
      { path: '/admin/practitioners', element: <AdminPractitioners /> },
      { path: '/admin/respondents', element: <AdminRespondents /> },
      { path: '/admin/roles', element: <AdminRoles /> },

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
