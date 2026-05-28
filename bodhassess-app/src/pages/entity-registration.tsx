import { useState } from 'react';
import { Brain, UserPlus, AlertTriangle, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { entityRegistrationsApi } from '@/lib/api';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';

export default function EntityRegistrationPage() {
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    dob: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ id: string } | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.companyName.trim()) { setError('Company name is required.'); return; }
    if (!form.email.trim()) { setError('Official email is required.'); return; }
    if (!form.phone.trim()) { setError('Phone is required.'); return; }
    if (!form.dob.trim()) { setError('Date of birth is required.'); return; }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setSaving(true);
    try {
      const created = await entityRegistrationsApi.create({
        name: form.name.trim(),
        companyName: form.companyName.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        dob: isoDob,
      });
      setDone({ id: created.id || '' });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('already registered')) {
        setError('This email is already registered.');
      } else {
        setError(`Could not submit registration — ${e?.message || 'please try again.'}`);
      }
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Entity Registration</h1>
          <p className="text-sm text-muted-foreground">
            Register yourself or your organisation. An admin will review your submission.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{done ? 'Registration received' : 'Register'}</CardTitle>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Submitted successfully.</p>
                    <p className="text-xs mt-1">
                      Your reference id: <span className="font-mono">{done.id}</span>. An admin will be in touch.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="md"
                  className="w-full"
                  onClick={() => { setDone(null); setForm({ name: '', companyName: '', email: '', phone: '', dob: '' }); }}
                >
                  Register another
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Arjun Patel"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Company Name *</label>
                  <input
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="e.g., Bodh Psychometric Pvt. Ltd."
                    autoComplete="organization"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Official Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })}
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[0.6875rem] text-muted-foreground">Format DD/MM/YYYY.</p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
                  <UserPlus className="h-4 w-4" />
                  {saving ? 'Submitting…' : 'Submit Registration'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
