'use client';

import { useState } from 'react';
import {
  ChevronRight,
  ClipboardCheck,
  Eye,
  Languages,
  Monitor,
  Search,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Vertical = 'Clinical' | 'Industrial' | 'Counselling' | 'Experiments';

interface InstrumentOption {
  name: string;
  vertical: Vertical;
  items: number;
  duration: string;
}

const instruments: InstrumentOption[] = [
  { name: 'PHQ-9 (Patient Health Questionnaire)', vertical: 'Clinical', items: 9, duration: '5 min' },
  { name: 'GAD-7 (Generalized Anxiety Disorder)', vertical: 'Clinical', items: 7, duration: '4 min' },
  { name: 'DASS-21 (Depression Anxiety Stress)', vertical: 'Clinical', items: 21, duration: '10 min' },
  { name: 'Beck BDI-II (Beck Depression Inventory)', vertical: 'Clinical', items: 21, duration: '10 min' },
  { name: 'PCL-5 (PTSD Checklist)', vertical: 'Clinical', items: 20, duration: '10 min' },
  { name: 'SCID-5 (Structured Clinical Interview)', vertical: 'Clinical', items: 45, duration: '30 min' },
  { name: 'Big Five IPIP-NEO', vertical: 'Industrial', items: 120, duration: '25 min' },
  { name: 'HEXACO Personality Inventory', vertical: 'Industrial', items: 60, duration: '15 min' },
  { name: 'Learning Agility Scale', vertical: 'Industrial', items: 30, duration: '12 min' },
  { name: 'Cognitive Ability Battery (CAB)', vertical: 'Industrial', items: 40, duration: '20 min' },
  { name: 'Situational Judgement Test (SJT)', vertical: 'Industrial', items: 25, duration: '15 min' },
  { name: 'SCAS (Spence Child Anxiety Scale)', vertical: 'Counselling', items: 44, duration: '15 min' },
  { name: 'CDI-2 (Child Depression Inventory)', vertical: 'Counselling', items: 28, duration: '10 min' },
  { name: 'SDQ (Strengths & Difficulties)', vertical: 'Counselling', items: 25, duration: '10 min' },
  { name: 'Career Interest Inventory (CII)', vertical: 'Counselling', items: 60, duration: '20 min' },
  { name: 'AI Adaptability Index', vertical: 'Experiments', items: 18, duration: '8 min' },
  { name: 'Digital Literacy Assessment', vertical: 'Experiments', items: 24, duration: '12 min' },
];

const languages = [
  'English', 'Hindi', 'Bengali', 'Telugu', 'Marathi',
  'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi',
];

const mockRespondents = [
  { id: 'R-001', name: 'Arjun Patel', email: 'arjun.patel@example.com' },
  { id: 'R-002', name: 'Priya Sharma', email: 'priya.sharma@example.com' },
  { id: 'R-003', name: 'Rahul Verma', email: 'rahul.verma@example.com' },
  { id: 'R-004', name: 'Ananya Reddy', email: 'ananya.reddy@example.com' },
  { id: 'R-005', name: 'Vikram Singh', email: 'vikram.singh@example.com' },
];

export default function CreateSessionPage() {
  const [vertical, setVertical] = useState<string>('all');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [respondentSearch, setRespondentSearch] = useState('');
  const [selectedRespondent, setSelectedRespondent] = useState<string>('');
  const [language, setLanguage] = useState('English');
  const [consentId, setConsentId] = useState('');
  const [proctoring, setProctoring] = useState(false);

  const filteredInstruments = instruments.filter(
    (i) => vertical === 'all' || i.vertical === vertical
  );

  const filteredRespondents = mockRespondents.filter(
    (r) =>
      respondentSearch === '' ||
      r.name.toLowerCase().includes(respondentSearch.toLowerCase()) ||
      r.email.toLowerCase().includes(respondentSearch.toLowerCase())
  );

  const selectedInstrumentData = instruments.find((i) => i.name === selectedInstrument);
  const selectedRespondentData = mockRespondents.find((r) => r.id === selectedRespondent);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <a href="/sessions" className="hover:text-foreground transition-colors">Sessions</a>
          <span>/</span>
          <span className="text-foreground font-medium">Create</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Session</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and launch a new assessment session for a respondent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vertical & Instrument */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" />
                Select Instrument
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Vertical</label>
                <Select value={vertical} onValueChange={setVertical}>
                  <SelectTrigger className="w-full" size="md">
                    <SelectValue placeholder="Select vertical" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Verticals</SelectItem>
                    <SelectItem value="Clinical">Clinical Psychology</SelectItem>
                    <SelectItem value="Industrial">Industrial Psychology</SelectItem>
                    <SelectItem value="Counselling">Counselling &amp; Child</SelectItem>
                    <SelectItem value="Experiments">Designing Experiments</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Instrument</label>
                <Select value={selectedInstrument} onValueChange={setSelectedInstrument}>
                  <SelectTrigger className="w-full" size="md">
                    <SelectValue placeholder="Choose an instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    {vertical === 'all' ? (
                      <>
                        {(['Clinical', 'Industrial', 'Counselling', 'Experiments'] as Vertical[]).map((v) => {
                          const group = filteredInstruments.filter((i) => i.vertical === v);
                          if (group.length === 0) return null;
                          return (
                            <div key={v}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {v}
                              </div>
                              {group.map((inst) => (
                                <SelectItem key={inst.name} value={inst.name}>
                                  {inst.name}
                                </SelectItem>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      filteredInstruments.map((inst) => (
                        <SelectItem key={inst.name} value={inst.name}>
                          {inst.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedInstrumentData && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <Badge size="sm" shape="circle" variant="info" appearance="light">
                    {selectedInstrumentData.items} items
                  </Badge>
                  <Badge size="sm" shape="circle" variant="secondary" appearance="light">
                    ~{selectedInstrumentData.duration}
                  </Badge>
                  <Badge size="sm" shape="circle" variant="primary" appearance="outline">
                    {selectedInstrumentData.vertical}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Respondent */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="size-4 text-primary" />
                Select Respondent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InputWrapper variant="md" className="w-full">
                <Search className="size-4" />
                <Input
                  placeholder="Search by name or email..."
                  value={respondentSearch}
                  onChange={(e) => setRespondentSearch(e.target.value)}
                />
              </InputWrapper>

              <div className="border border-border rounded-lg overflow-hidden">
                {filteredRespondents.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRespondent(r.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm text-left border-b border-border last:border-0 transition-colors ${
                      selectedRespondent === r.id
                        ? 'bg-primary/5 text-primary'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </div>
                    {selectedRespondent === r.id && (
                      <Badge size="sm" shape="circle" variant="success" appearance="light">Selected</Badge>
                    )}
                  </button>
                ))}
                {filteredRespondents.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No respondents found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="size-4 text-primary" />
                Session Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <Languages className="size-3.5 text-muted-foreground" />
                    Delivery Language
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full" size="md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                    Consent Record ID
                  </label>
                  <Input
                    variant="md"
                    placeholder="e.g. CONSENT-2026-0012"
                    value={consentId}
                    onChange={(e) => setConsentId(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Proctoring</p>
                  <p className="text-xs text-muted-foreground">
                    Enable webcam and screen monitoring during assessment
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProctoring(!proctoring)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    proctoring ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      proctoring ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <div className="space-y-5">
          <Card className="sticky top-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="size-4 text-primary" />
                Session Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Instrument</span>
                  <span className="font-medium text-right max-w-[60%] truncate">
                    {selectedInstrumentData?.name || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Vertical</span>
                  <span className="font-medium">
                    {selectedInstrumentData?.vertical || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-medium">
                    {selectedInstrumentData?.items || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">
                    {selectedInstrumentData ? `~${selectedInstrumentData.duration}` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Respondent</span>
                  <span className="font-medium">
                    {selectedRespondentData?.name || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Language</span>
                  <span className="font-medium">{language}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Consent ID</span>
                  <span className="font-medium font-mono text-xs">
                    {consentId || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Proctoring</span>
                  <Badge
                    size="sm"
                    shape="circle"
                    variant={proctoring ? 'success' : 'secondary'}
                    appearance="light"
                  >
                    {proctoring ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button variant="primary" size="md" className="w-full">
                  <ClipboardCheck className="size-4" />
                  Create Session
                </Button>
                <Button variant="outline" size="md" className="w-full">
                  <Send className="size-4" />
                  Create &amp; Send Invitation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
