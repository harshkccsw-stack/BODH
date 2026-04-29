import { Plug, Shield, MessageSquare, Phone, Sparkles, Cloud } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const integrations = [
  {
    name: 'Keycloak SSO',
    description: 'Single sign-on and identity management for practitioners and respondents.',
    icon: Shield,
    status: 'Connected',
    details: 'Realm: bodhassess | Users synced: 1,570',
  },
  {
    name: 'Gupshup WhatsApp',
    description: 'WhatsApp Business API for assessment delivery and consent collection.',
    icon: MessageSquare,
    status: 'Connected',
    details: 'Messages sent today: 127 | Template approved: 8',
  },
  {
    name: 'Twilio SMS',
    description: 'SMS delivery for assessment links and OTP verification.',
    icon: Phone,
    status: 'Connected',
    details: 'SMS sent today: 45 | Balance: $234.50',
  },
  {
    name: 'Claude API',
    description: 'AI-powered analytics engine for BodhLens natural language queries.',
    icon: Sparkles,
    status: 'Connected',
    details: 'Model: claude-sonnet-4-20250514 | Queries today: 89',
  },
  {
    name: 'DigitalOcean',
    description: 'Cloud infrastructure for data storage, compute, and managed databases.',
    icon: Cloud,
    status: 'Disconnected',
    details: 'Not configured — click Configure to set up',
  },
];

const statusColors: Record<string, string> = {
  Connected: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Disconnected: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function IntegrationsPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Settings</span>
          <span>/</span>
          <span className="text-foreground font-medium">Integrations</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage third-party service connections.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Connected Services</p>
                <p className="text-2xl font-semibold mt-1">4</p>
                <p className="text-xs text-muted-foreground mt-1">of 5 integrations</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Plug className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">API Calls Today</p>
                <p className="text-2xl font-semibold mt-1">261</p>
                <p className="text-xs text-muted-foreground mt-1">Across all services</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Cloud className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {integrations.map((integration) => (
          <Card key={integration.name}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                    <integration.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{integration.name}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[integration.status]}`}>
                        {integration.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{integration.description}</p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{integration.details}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
