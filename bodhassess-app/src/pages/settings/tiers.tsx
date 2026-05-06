import { Layers, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const tiers = [
  {
    name: 'T1 — Free',
    description: 'Basic access for individual practitioners. Limited to 10 respondents and 3 instruments.',
    features: ['10 respondents', '3 instruments', 'Email delivery only', 'Basic reports'],
    active: true,
  },
  {
    name: 'T2 — Starter',
    description: 'Small practices and clinics. Includes WhatsApp delivery and BodhLens basics.',
    features: ['100 respondents', '15 instruments', 'Email + WhatsApp', 'BodhLens (5 queries/day)', 'Basic proctoring'],
    active: true,
  },
  {
    name: 'T3 — Professional',
    description: 'Mid-size organizations. Full multi-channel delivery and advanced analytics.',
    features: ['500 respondents', 'All instruments', 'Email + WhatsApp + SMS', 'BodhLens unlimited', 'Full proctoring', 'Batch upload'],
    active: true,
  },
  {
    name: 'T4 — Enterprise',
    description: 'Large organizations with custom branding, API access, and dedicated support.',
    features: ['Unlimited respondents', 'All instruments', 'All channels', 'BodhLens unlimited', 'Full proctoring', 'API access (BPaaS)', 'Custom branding', 'SSO integration'],
    active: true,
  },
  {
    name: 'T5 — White-Label',
    description: 'Full platform white-labeling with custom domain, branding, and reseller capabilities.',
    features: ['Unlimited everything', 'Custom domain', 'Full branding control', 'Reseller dashboard', 'Dedicated infrastructure', 'SLA guarantee', 'Priority support'],
    active: false,
  },
];

export default function TiersPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Settings</span>
          <span>/</span>
          <span className="text-foreground font-medium">Tiers</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Tier Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage subscription tiers and feature gates.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {tiers.map((tier) => (
          <Card key={tier.name} className={tier.active ? '' : 'opacity-60'}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  {tier.name}
                </CardTitle>
                <div className={`h-5 w-9 rounded-full relative cursor-pointer transition-colors ${tier.active ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${tier.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{tier.description}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {tier.features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
                    <Check className="h-2.5 w-2.5 text-green-700 dark:text-green-400" />
                  </div>
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
