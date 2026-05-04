import { Stethoscope, Briefcase, GraduationCap, FlaskConical, Tag } from 'lucide-react';
import Link from '@/src/lib/router-helpers';
import { cn } from '@/lib/utils';

const verticals = [
  {
    id: 'clinical',
    title: 'Clinical Psychology',
    description: 'For clinical psychologists, psychiatrists, and mental health practitioners.',
    instruments: 'PHQ-9, GAD-7, DASS-21, Beck BDI-II, PCL-5, AUDIT',
    icon: Stethoscope,
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
    borderHover: 'hover:border-red-500/30',
    href: '/dashboard?vertical=clinical',
  },
  {
    id: 'industrial',
    title: 'Industrial Psychology',
    description: 'For HR teams, I-O psychologists, and people operations.',
    instruments: 'Big Five, HEXACO, Learning Agility, AI Adaptability Index, SJTs',
    icon: Briefcase,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderHover: 'hover:border-blue-500/30',
    href: '/dashboard?vertical=industrial',
  },
  {
    id: 'counselling',
    title: 'Counselling & Child',
    description: 'For school counsellors, child psychologists, and developmental practitioners.',
    instruments: 'SCAS, CDI-2, ADHD Rating Scale-5, Academic Stress Inventory',
    icon: GraduationCap,
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
    borderHover: 'hover:border-green-500/30',
    href: '/dashboard?vertical=counselling',
  },
  {
    id: 'experiments',
    title: 'Designing Experiments',
    description: 'For researchers and clinical scientists running controlled paradigms.',
    instruments: 'IAT, Dot Probe, Stroop, Go/No-Go, N-Back, Delay Discounting',
    icon: FlaskConical,
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    borderHover: 'hover:border-purple-500/30',
    href: '/dashboard?vertical=experiments',
  },
  {
    id: 'whitelabel',
    title: 'White-Label',
    description: 'Run BodhAssess under your institution\'s brand identity.',
    instruments: 'Inherits selected vertical. Custom domain, branding, terminology.',
    icon: Tag,
    color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
    borderHover: 'hover:border-zinc-500/30',
    href: '/dashboard?vertical=whitelabel',
  },
];

export default function SelectVerticalPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Welcome to <span className="text-primary">BodhAssess</span>
        </h1>
        <p className="mt-3 text-base text-muted-foreground max-w-md mx-auto">
          Select your vertical. The entire platform adapts — instruments, terminology, reports, and AI features.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl w-full">
        {verticals.map((v) => (
          <Link
            key={v.id}
            href={v.href}
            className={cn(
              'group relative flex flex-col rounded-xl border border-border bg-card p-6 transition-all duration-200',
              'hover:shadow-lg hover:-translate-y-0.5',
              v.borderHover,
            )}
          >
            <div className={cn('mb-4 flex h-12 w-12 items-center justify-center rounded-lg', v.color)}>
              <v.icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
              {v.title}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              {v.description}
            </p>
            <p className="mt-3 text-xs text-muted-foreground/70 font-mono leading-relaxed">
              {v.instruments}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        BODH Psychometric Solutions &middot; Phase 1 &middot; DPDP Compliant
      </p>
    </div>
  );
}
