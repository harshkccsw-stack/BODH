'use client';

import { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  Clock,
  CheckCircle2,
  Settings,
  Database,
  Users,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const experiments = [
  { id: 'EXP-001', name: 'IAT - Implicit Self-Harm' },
  { id: 'EXP-002', name: 'Dot Probe - Anxiety Threat' },
  { id: 'EXP-003', name: 'Stroop - Emotional Interference' },
  { id: 'EXP-004', name: 'Go/No-Go - Response Inhibition' },
  { id: 'EXP-005', name: 'N-Back - Working Memory (2-back)' },
];

const participants = [
  { id: 'P-001', name: 'Arjun Patel' },
  { id: 'P-002', name: 'Priya Sharma' },
  { id: 'P-003', name: 'Rahul Verma' },
  { id: 'P-004', name: 'Ananya Reddy' },
  { id: 'P-005', name: 'Vikram Singh' },
  { id: 'P-006', name: 'Meera Nair' },
];

const dataFormats = [
  { id: 'csv', label: 'CSV', icon: FileSpreadsheet, description: 'Comma-separated values' },
  { id: 'json', label: 'JSON', icon: FileJson, description: 'JavaScript Object Notation' },
  { id: 'spss', label: 'SPSS (.sav)', icon: FileText, description: 'SPSS data file' },
];

const includeOptions = [
  { id: 'raw_rt', label: 'Raw Reaction Times', description: 'Trial-level RT in milliseconds' },
  { id: 'accuracy', label: 'Accuracy Data', description: 'Correct/incorrect per trial' },
  { id: 'trial_metadata', label: 'Trial Metadata', description: 'Block, trial number, condition' },
  { id: 'stimulus_info', label: 'Stimulus Info', description: 'Stimulus content, category, position' },
];

const previewColumns = [
  'participant_id', 'trial_number', 'block', 'condition', 'stimulus',
  'stimulus_category', 'response', 'correct', 'rt_ms', 'timestamp',
];

interface RecentExport {
  id: string;
  experiment: string;
  participants: number;
  format: string;
  size: string;
  date: string;
}

const recentExports: RecentExport[] = [
  { id: 'DL-001', experiment: 'IAT - Implicit Self-Harm', participants: 45, format: 'CSV', size: '2.4 MB', date: '2026-04-08' },
  { id: 'DL-002', experiment: 'Dot Probe - Anxiety Threat', participants: 32, format: 'JSON', size: '3.1 MB', date: '2026-04-07' },
  { id: 'DL-003', experiment: 'Stroop - Emotional Interference', participants: 28, format: 'SPSS', size: '1.8 MB', date: '2026-04-05' },
  { id: 'DL-004', experiment: 'Go/No-Go - Response Inhibition', participants: 50, format: 'CSV', size: '4.2 MB', date: '2026-04-03' },
  { id: 'DL-005', experiment: 'N-Back - Working Memory', participants: 20, format: 'JSON', size: '1.5 MB', date: '2026-04-01' },
];

export default function TrialDataExportPage() {
  const [selectedExperiment, setSelectedExperiment] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [selectedIncludes, setSelectedIncludes] = useState<string[]>(['raw_rt', 'accuracy', 'trial_metadata', 'stimulus_info']);

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleInclude = (id: string) => {
    setSelectedIncludes((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Designing Experiments</span>
          <span>/</span>
          <span className="text-foreground font-medium">Trial Data Export</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Trial Data Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Export trial-level experimental data in multiple formats for analysis in R, SPSS, or Python.
        </p>
      </div>

      {/* Export Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Config Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Select Experiment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Select Experiment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <select
                className="h-8.5 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedExperiment}
                onChange={(e) => setSelectedExperiment(e.target.value)}
              >
                <option value="">Choose an experiment...</option>
                {experiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>{exp.name}</option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* Select Participants */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Select Participants
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="flex items-center gap-2 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedParticipants(participants.map((p) => p.id))}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedParticipants([])}
                >
                  Clear
                </Button>
                <span className="text-xs text-muted-foreground ml-2">
                  {selectedParticipants.length} of {participants.length} selected
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {participants.map((p) => {
                  const isSelected = selectedParticipants.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleParticipant(p.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors text-left',
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <div className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        isSelected ? 'border-primary bg-primary' : 'border-input'
                      )}>
                        {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Data Format */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Data Format
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="grid grid-cols-3 gap-3">
                {dataFormats.map((format) => {
                  const Icon = format.icon;
                  const isSelected = selectedFormat === format.id;
                  return (
                    <button
                      key={format.id}
                      onClick={() => setSelectedFormat(format.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-medium">{format.label}</span>
                      <span className="text-xs text-muted-foreground">{format.description}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Include Options */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Include in Export
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {includeOptions.map((option) => {
                  const isSelected = selectedIncludes.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleInclude(option.id)}
                      className={cn(
                        'flex items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <div className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border mt-0.5 shrink-0',
                        isSelected ? 'border-primary bg-primary' : 'border-input'
                      )}>
                        {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Preview + Export */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Export Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <p className="text-xs text-muted-foreground mb-3">Columns included in export:</p>
              <div className="space-y-1.5">
                {previewColumns.map((col) => (
                  <div key={col} className="flex items-center gap-2 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{col}</code>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Format</span>
                  <span className="font-medium">{selectedFormat.toUpperCase()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Participants</span>
                  <span className="font-medium">{selectedParticipants.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Est. rows</span>
                  <span className="font-medium">{selectedParticipants.length * 60 || 0}</span>
                </div>
              </div>
              <Button variant="primary" size="sm" className="w-full mt-4">
                <Download className="h-4 w-4" />
                Export Data
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-muted/20">
            <CardContent className="p-4">
              <p className="text-xs font-medium mb-1">Data Note</p>
              <p className="text-xs text-muted-foreground">
                All reaction time data is recorded with millisecond precision via jsPsych. Outlier trials
                (RT &lt; 150ms or &gt; 3000ms) are flagged but not removed. Apply your own exclusion criteria
                during analysis.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Exports Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Exports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Experiment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Participants</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Format</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentExports.map((exp) => (
                  <tr key={exp.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-xs">{exp.experiment}</td>
                    <td className="px-5 py-3">{exp.participants}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                        {exp.format}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{exp.size}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {exp.date}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Button variant="ghost" size="sm">
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
