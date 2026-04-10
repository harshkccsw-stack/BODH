'use client';

import { Building2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TenantSettingsPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Settings</span>
          <span>/</span>
          <span className="text-foreground font-medium">Organization</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your organization's default vertical, language, timezone, and branding.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Organization Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 max-w-xl">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Tenant Name</label>
            <Input defaultValue="Apollo Hospital" placeholder="Organization name" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Logo</label>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Click or drag to upload logo</p>
              <p className="text-xs text-muted-foreground mt-1">SVG, PNG or JPG (max 2MB)</p>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Default Vertical</label>
            <select className="flex w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm">
              <option>Clinical Psychology</option>
              <option>Industrial Psychology</option>
              <option>Counselling & Child</option>
              <option>Designing Experiments</option>
              <option>White-Label</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Default Language</label>
            <select className="flex w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm">
              <option>English</option>
              <option>Hindi</option>
              <option>Marathi</option>
              <option>Tamil</option>
              <option>Telugu</option>
              <option>Kannada</option>
              <option>Bengali</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Timezone</label>
            <select className="flex w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm">
              <option>Asia/Kolkata (IST, UTC+5:30)</option>
              <option>UTC</option>
              <option>America/New_York (EST)</option>
              <option>Europe/London (GMT)</option>
              <option>Asia/Singapore (SGT)</option>
            </select>
          </div>
          <Button variant="primary" className="w-full">Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
