'use client';

import { useState } from 'react';
import { Brain, UserPlus, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { respondentsApi } from '@/lib/api';
import { config } from '@/lib/config';

const AUTH_KEY = config.authStorageKey;

function generateRespondentId(): string {
  // Human-readable ID: R-YYMMDD-XXXX
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `R-${yy}${mm}${dd}-${rand}`;
}

type AccountType = 'individual' | 'organization';

export default function PortalRegisterPage() {
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; autoSignedIn: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedDob = dob.trim();
    const trimmedOrg = orgName.trim();
    const trimmedWebsite = orgWebsite.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone || !trimmedDob) {
      setError('Please fill in your name, email, phone and date of birth.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setError('That does not look like a valid email address.');
      return;
    }
    // Accept digits, spaces, dashes, parens and an optional leading +; must have at least 7 digits.
    const phoneDigits = trimmedPhone.replace(/\D/g, '');
    if (!/^\+?[\d\s()-]{7,}$/.test(trimmedPhone) || phoneDigits.length < 7) {
      setError('Please enter a valid phone number (at least 7 digits).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDob)) {
      setError('Please enter a valid date of birth.');
      return;
    }
    if (accountType === 'organization') {
      if (!trimmedOrg) {
        setError('Organization name is required.');
        return;
      }
      if (trimmedWebsite && !/^https?:\/\/.+\..+/i.test(trimmedWebsite)) {
        setError('Website must start with http:// or https:// and look like a URL.');
        return;
      }
    }

    setSubmitting(true);
    const id = generateRespondentId();
    try {
      await respondentsApi.create({
        id,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        dob: trimmedDob,
        consent: 'Granted',
        accountType,
        orgName: accountType === 'organization' ? trimmedOrg : undefined,
        orgWebsite: accountType === 'organization' ? trimmedWebsite : undefined,
      });

      // Try to auto-sign-in so the respondent lands straight on their dashboard.
      let autoSignedIn = false;
      try {
        const loginRes = await respondentsApi.login(id, trimmedDob);
        sessionStorage.setItem(AUTH_KEY, loginRes.token);
        autoSignedIn = true;
      } catch {
        // Auto-login failed — not fatal. The user can still sign in manually.
      }

      setCreated({ id, autoSignedIn });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('409') || msg.toLowerCase().includes('duplicate')) {
        setError('An account with that ID or email already exists. Please sign in instead.');
      } else {
        setError('Registration failed — the API may be unreachable. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyId = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your BodhAssess account</h1>
          <p className="text-sm text-muted-foreground">
            Register to take assessments online. No admin needed.
          </p>
        </div>

        {created ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Account Created
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Save your Login ID — you will need it along with your date of birth to sign in next time.
              </p>
              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Login ID</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-lg font-semibold">{created.id}</p>
                  <Button variant="outline" size="sm" onClick={copyId}>
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              {created.autoSignedIn ? (
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => { window.location.href = '/portal/assessments'; }}
                >
                  Continue to My Assessments
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => { window.location.href = '/portal/login'; }}
                >
                  Go to Sign In
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Register</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Account Type *</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as AccountType)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="individual">Individual</option>
                    <option value="organization">Organization</option>
                  </select>
                </div>

                {accountType === 'organization' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Organization Name *</label>
                      <input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g., Apollo Hospitals"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Website <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <input
                        type="url"
                        value={orgWebsite}
                        onChange={(e) => setOrgWebsite(e.target.value)}
                        placeholder="https://example.com"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {accountType === 'organization' ? 'Primary Contact Name *' : 'Full Name *'}
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={accountType === 'organization' ? 'e.g., Admin contact at your org' : 'e.g., Arjun Patel'}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Your date of birth doubles as your sign-in password. Keep it safe.
                  </p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={submitting}>
                  <UserPlus className="h-4 w-4" />
                  {submitting ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!created && (
          <p className="text-center text-xs text-muted-foreground">
            Already registered?{' '}
            <a href="/portal/login" className="text-primary hover:underline font-medium">
              Sign in here
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
