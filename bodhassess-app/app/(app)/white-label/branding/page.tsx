'use client';

import { Palette, Upload, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function BrandingPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>White-Label</span>
          <span>/</span>
          <span className="text-foreground font-medium">Branding</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Branding Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">Customize the look and feel for your tenant.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Brand Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Logo</label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click or drag to upload logo</p>
                <p className="text-xs text-muted-foreground mt-1">SVG, PNG or JPG (max 2MB)</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Primary Color</label>
                <div className="flex gap-2 items-center">
                  <div className="h-8.5 w-8.5 rounded-md bg-blue-600 border border-input shrink-0" />
                  <Input defaultValue="#2563EB" placeholder="#2563EB" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Secondary Color</label>
                <div className="flex gap-2 items-center">
                  <div className="h-8.5 w-8.5 rounded-md bg-slate-600 border border-input shrink-0" />
                  <Input defaultValue="#475569" placeholder="#475569" />
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Font Family</label>
              <select className="flex w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm">
                <option>Inter</option>
                <option>Roboto</option>
                <option>Open Sans</option>
                <option>Lato</option>
                <option>Poppins</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Favicon</label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer">
                <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-xs text-muted-foreground">Upload favicon (32x32 ICO/PNG)</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email Sender Name</label>
              <Input defaultValue="BodhAssess" placeholder="Your Brand Name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Custom Domain</label>
              <Input defaultValue="assess.yourdomain.com" placeholder="assess.yourdomain.com" />
            </div>
            <Button variant="primary" className="w-full">Save Branding</Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Login Page Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-gradient-to-br from-blue-50 to-slate-50 dark:from-blue-950/20 dark:to-slate-950/20 p-8 space-y-6">
              <div className="text-center">
                <div className="h-12 w-12 rounded-lg bg-blue-600 mx-auto flex items-center justify-center text-white font-bold text-lg">
                  B
                </div>
                <h2 className="text-lg font-semibold mt-3">Welcome Back</h2>
                <p className="text-sm text-muted-foreground">Sign in to your account</p>
              </div>
              <div className="space-y-3 max-w-xs mx-auto">
                <Input placeholder="Email address" disabled />
                <Input placeholder="Password" type="password" disabled />
                <div className="h-8.5 rounded-md bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                  Sign In
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Powered by BodhAssess
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
