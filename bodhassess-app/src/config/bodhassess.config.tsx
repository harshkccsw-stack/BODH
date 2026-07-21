import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  FlaskConical,
  GraduationCap,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  Microscope,
  Settings,
  Shield,
  ShieldCheck,
  Stethoscope,
  Table2,
  Tag,
  Users,
} from 'lucide-react';
import { MenuConfig } from '@/config/types';

export const MENU_SIDEBAR: MenuConfig = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  { heading: 'Assessments' },
  // Legacy v1-dialect assessments group — superseded by Assessment Library
  // below. Commented out (not deleted) so the cutover stays reversible.
  // {
  //   title: 'Assessments',
  //   icon: ClipboardList,
  //   children: [
  //     { title: 'All Assessments', path: '/assessments' },
  //     { title: 'Create Assessment', path: '/assessments/create' },
  //     { title: 'Batch Upload', path: '/assessments/batch' },
  //   ],
  // },
  {
    title: 'Assessment Library',
    icon: ClipboardCheck,
    children: [
      { title: 'Assessments', path: '/assessment-library/assessments' },
    ],
  },
  {
    title: 'Questionnaire Library',
    icon: BookOpen,
    children: [
      { title: 'All Questionnaires', path: '/questionnaires' },
      { title: 'Create Questionnaire', path: '/question-bank/create' },
      { title: 'Questions', path: '/question-bank/questions' },
      { title: 'Demographic Fields', path: '/questionnaires/demographics' },
    ],
  },
  {
    title: 'Question Bank',
    icon: Brain,
    children: [
      { title: 'Item Explorer', path: '/question-bank' },
      { title: 'Measured Qualities', path: '/question-bank/qualities' },
      { title: 'IRT Calibration', path: '/question-bank/calibration' },
      { title: 'Norm Tables', path: '/question-bank/norms' },
    ],
  },
  {
    title: 'Reports',
    icon: FileText,
    children: [
      { title: 'All Reports', path: '/reports' },
      { title: 'Response Sheets', path: '/reports/responses' },
    ],
  },
  { heading: 'Entity Management' },
  {
    title: 'Organizations',
    icon: Building2,
    path: '/admin/entity-registrations',
  },
  { heading: 'Platform' },
  {
    title: 'BodhLens Analytics',
    icon: Microscope,
    path: '/analytics',
  },
  {
    title: 'Data Studio',
    icon: LayoutGrid,
    path: '/data-studio',
  },
  {
    title: 'BodhSurvey',
    icon: BarChart3,
    path: '/survey',
  },
  {
    title: 'White-Label',
    icon: Tag,
    children: [
      { title: 'Tenant Management', path: '/white-label/tenants' },
      { title: 'Branding Config', path: '/white-label/branding' },
      { title: 'BPaaS API Keys', path: '/white-label/api' },
    ],
  },
  { heading: 'Administration' },
  {
    title: 'Live Tracking',
    icon: Activity,
    path: '/admin/live-tracking',
  },
  {
    title: 'Data Grid',
    icon: Table2,
    path: '/admin/data-grid',
  },
  {
    title: 'Users',
    icon: Users,
    children: [
      { title: 'Practitioners', path: '/admin/practitioners' },
      { title: 'Respondents', path: '/admin/respondents' },
      { title: 'Groups', path: '/admin/groups' },
    ],
  },
  {
    title: 'Roles',
    icon: ShieldCheck,
    children: [
      { title: 'Roles & Permissions', path: '/admin/permissions' },
      { title: 'Permissions', path: '/admin/roles' },
    ],
  },
  {
    title: 'DPDP Compliance',
    icon: Shield,
    children: [
      { title: 'Consent Records', path: '/compliance/consent' },
      { title: 'Erasure Requests', path: '/compliance/erasure' },
      { title: 'Audit Trail', path: '/compliance/audit' },
      { title: 'Data Principal Portal', path: '/compliance/portal' },
    ],
  },
  {
    title: 'Settings',
    icon: Settings,
    children: [
      { title: 'Organization Settings', path: '/settings/tenant' },
      { title: 'Tier Configuration', path: '/settings/tiers' },
      { title: 'Integrations', path: '/settings/integrations' },
    ],
  },
];

export const MENU_MEGA: MenuConfig = [
  { title: 'Dashboard', path: '/dashboard' },
  {
    title: 'Assessments',
    children: [
      {
        title: 'Core',
        children: [
          {
            children: [
              { title: 'All Assessments', icon: ClipboardList, path: '/assessments' },
              { title: 'Create Assessment', icon: Activity, path: '/assessments/create' },
              { title: 'Questionnaire Library', icon: BookOpen, path: '/questionnaires' },
              { title: 'Question Bank', icon: Brain, path: '/question-bank' },
              { title: 'Reports', icon: FileText, path: '/reports' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Verticals',
    children: [
      {
        title: 'Psychology Verticals',
        children: [
          {
            children: [
              { title: 'Clinical Psychology', icon: Stethoscope, path: '/clinical/clients' },
              { title: 'Industrial Psychology', icon: Briefcase, path: '/industrial/cohorts' },
              { title: 'Counselling & Child', icon: GraduationCap, path: '/counselling/students' },
              { title: 'Designing Experiments', icon: FlaskConical, path: '/experiments/builder' },
              { title: 'White-Label', icon: Tag, path: '/white-label/tenants' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Analytics',
    children: [
      {
        title: 'Intelligence',
        children: [
          {
            children: [
              { title: 'BodhLens', icon: Microscope, path: '/analytics' },
              { title: 'BodhSurvey', icon: BarChart3, path: '/survey' },
            ],
          },
        ],
      },
    ],
  },
];

export const MENU_MEGA_MOBILE: MenuConfig = MENU_MEGA;
