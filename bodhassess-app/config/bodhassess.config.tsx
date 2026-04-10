import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  ClipboardList,
  FileText,
  FlaskConical,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Microscope,
  Settings,
  Shield,
  Stethoscope,
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
  {
    title: 'Sessions',
    icon: ClipboardList,
    children: [
      { title: 'All Sessions', path: '/sessions' },
      { title: 'Create Session', path: '/sessions/create' },
      { title: 'Batch Upload', path: '/sessions/batch' },
    ],
  },
  {
    title: 'Instrument Library',
    icon: BookOpen,
    children: [
      { title: 'All Instruments', path: '/instruments' },
      { title: 'Clinical Instruments', path: '/instruments/clinical' },
      { title: 'Industrial Instruments', path: '/instruments/industrial' },
      { title: 'Counselling Instruments', path: '/instruments/counselling' },
      { title: 'Experimental Paradigms', path: '/instruments/experimental' },
    ],
  },
  {
    title: 'Question Bank',
    icon: Brain,
    children: [
      { title: 'Item Explorer', path: '/question-bank' },
      { title: 'IRT Calibration', path: '/question-bank/calibration' },
      { title: 'Norm Tables', path: '/question-bank/norms' },
    ],
  },
  {
    title: 'Reports',
    icon: FileText,
    children: [
      { title: 'All Reports', path: '/reports' },
      { title: 'Clinical Reports', path: '/reports/clinical' },
      { title: 'Industrial Reports', path: '/reports/industrial' },
      { title: 'Counselling Reports', path: '/reports/counselling' },
    ],
  },
  { heading: 'Verticals' },
  {
    title: 'Clinical Psychology',
    icon: Stethoscope,
    children: [
      { title: 'Client Records', path: '/clinical/clients' },
      { title: 'MSE Upload', path: '/clinical/mse-upload' },
      { title: 'Longitudinal Tracking', path: '/clinical/tracking' },
      { title: 'Risk Alerts', path: '/clinical/risk-alerts' },
    ],
  },
  {
    title: 'Industrial Psychology',
    icon: Briefcase,
    children: [
      { title: 'Candidate Cohorts', path: '/industrial/cohorts' },
      { title: 'Competency Frameworks', path: '/industrial/competency' },
      { title: 'AI Adaptability Index', path: '/industrial/ai-adaptability' },
      { title: 'Proctoring Dashboard', path: '/industrial/proctoring' },
    ],
  },
  {
    title: 'Counselling & Child',
    icon: GraduationCap,
    children: [
      { title: 'Student Records', path: '/counselling/students' },
      { title: 'Multi-Informant Sessions', path: '/counselling/multi-informant' },
      { title: 'Parent Consent', path: '/counselling/consent' },
      { title: 'Developmental Tracking', path: '/counselling/developmental' },
    ],
  },
  {
    title: 'Designing Experiments',
    icon: FlaskConical,
    children: [
      { title: 'Experiment Builder', path: '/experiments/builder' },
      { title: 'Paradigm Library', path: '/experiments/paradigms' },
      { title: 'Trial Data Export', path: '/experiments/export' },
    ],
  },
  { heading: 'Platform' },
  {
    title: 'BodhLens Analytics',
    icon: Microscope,
    path: '/analytics',
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
    title: 'Users & Roles',
    icon: Users,
    children: [
      { title: 'Practitioners', path: '/admin/practitioners' },
      { title: 'Respondents', path: '/admin/respondents' },
      { title: 'Roles & Permissions', path: '/admin/roles' },
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
              { title: 'All Sessions', icon: ClipboardList, path: '/sessions' },
              { title: 'Create Session', icon: Activity, path: '/sessions/create' },
              { title: 'Instrument Library', icon: BookOpen, path: '/instruments' },
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
