'use client';

import { Shield, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const roles = [
  {
    name: 'Platform Admin',
    description: 'Full system access across all tenants and verticals.',
    permissions: {
      'Manage Tenants': true, 'Manage Users': true, 'View All Data': true,
      'Configure Branding': true, 'Manage API Keys': true, 'View Audit Logs': true,
      'Process Erasure': true, 'Manage Instruments': true,
    },
  },
  {
    name: 'Tenant Admin',
    description: 'Full access within their assigned tenant.',
    permissions: {
      'Manage Tenants': false, 'Manage Users': true, 'View All Data': true,
      'Configure Branding': true, 'Manage API Keys': true, 'View Audit Logs': true,
      'Process Erasure': true, 'Manage Instruments': true,
    },
  },
  {
    name: 'Senior Practitioner',
    description: 'Can manage other practitioners and view aggregate data.',
    permissions: {
      'Manage Tenants': false, 'Manage Users': true, 'View All Data': true,
      'Configure Branding': false, 'Manage API Keys': false, 'View Audit Logs': true,
      'Process Erasure': false, 'Manage Instruments': true,
    },
  },
  {
    name: 'Practitioner',
    description: 'Can administer assessments and view own client data.',
    permissions: {
      'Manage Tenants': false, 'Manage Users': false, 'View All Data': false,
      'Configure Branding': false, 'Manage API Keys': false, 'View Audit Logs': false,
      'Process Erasure': false, 'Manage Instruments': false,
    },
  },
  {
    name: 'BodhLens Viewer',
    description: 'Read-only access to analytics and reports.',
    permissions: {
      'Manage Tenants': false, 'Manage Users': false, 'View All Data': true,
      'Configure Branding': false, 'Manage API Keys': false, 'View Audit Logs': true,
      'Process Erasure': false, 'Manage Instruments': false,
    },
  },
  {
    name: 'Respondent',
    description: 'Can take assessments and view own data via the portal.',
    permissions: {
      'Manage Tenants': false, 'Manage Users': false, 'View All Data': false,
      'Configure Branding': false, 'Manage API Keys': false, 'View Audit Logs': false,
      'Process Erasure': false, 'Manage Instruments': false,
    },
  },
];

export default function RolesPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Admin</span>
          <span>/</span>
          <span className="text-foreground font-medium">Roles & Permissions</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure role-based access control for the platform.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {roles.map((role) => (
          <Card key={role.name}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                {role.name}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{role.description}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(role.permissions).map(([perm, enabled]) => (
                <div key={perm} className="flex items-center justify-between py-1">
                  <span className="text-sm">{perm}</span>
                  {enabled ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <Check className="h-3 w-3 text-green-700 dark:text-green-400" />
                    </div>
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900/30">
                      <X className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
