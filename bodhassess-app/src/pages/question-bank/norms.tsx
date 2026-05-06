import { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Database,
  FileText,
  Globe,
  Info,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types & Data
// ---------------------------------------------------------------------------

interface NormRow {
  rawScore: number;
  tScore: number;
  percentile: number;
  severity: string;
  ci95: string;
}

interface NormTable {
  id: string;
  instrument: string;
  population: string;
  sampleSize: number;
  dateRange: string;
  demographicNote: string;
  rows: NormRow[];
}

const normTables: NormTable[] = [
  {
    id: 'NORM-PHQ9-IND-ADULT',
    instrument: 'PHQ-9',
    population: 'Indian Adult (18-65)',
    sampleSize: 16450,
    dateRange: 'Jan 2024 - Dec 2025',
    demographicNote: 'Urban and rural adults across 12 states, balanced gender (52% F, 48% M), education: 34% graduate+',
    rows: [
      { rawScore: 0, tScore: 30, percentile: 2, severity: 'None', ci95: '28-32' },
      { rawScore: 3, tScore: 38, percentile: 12, severity: 'Minimal', ci95: '36-40' },
      { rawScore: 5, tScore: 45, percentile: 31, severity: 'Mild', ci95: '43-47' },
      { rawScore: 10, tScore: 55, percentile: 69, severity: 'Moderate', ci95: '53-57' },
      { rawScore: 15, tScore: 65, percentile: 93, severity: 'Moderately Severe', ci95: '63-67' },
      { rawScore: 20, tScore: 72, percentile: 97, severity: 'Severe', ci95: '70-74' },
      { rawScore: 27, tScore: 80, percentile: 99, severity: 'Very Severe', ci95: '78-82' },
    ],
  },
  {
    id: 'NORM-BIG5-IND-PROF',
    instrument: 'Big Five (IPIP-NEO-120)',
    population: 'Indian Professional (22-55)',
    sampleSize: 9800,
    dateRange: 'Mar 2024 - Nov 2025',
    demographicNote: 'Corporate professionals from IT, manufacturing, BFSI sectors; 61% male, 39% female; 78% metro cities',
    rows: [
      { rawScore: 24, tScore: 30, percentile: 2, severity: 'Very Low', ci95: '27-33' },
      { rawScore: 48, tScore: 38, percentile: 12, severity: 'Low', ci95: '35-41' },
      { rawScore: 72, tScore: 45, percentile: 31, severity: 'Below Average', ci95: '42-48' },
      { rawScore: 84, tScore: 50, percentile: 50, severity: 'Average', ci95: '47-53' },
      { rawScore: 96, tScore: 55, percentile: 69, severity: 'Above Average', ci95: '52-58' },
      { rawScore: 108, tScore: 62, percentile: 88, severity: 'High', ci95: '59-65' },
      { rawScore: 120, tScore: 70, percentile: 98, severity: 'Very High', ci95: '67-73' },
    ],
  },
  {
    id: 'NORM-SCAS-IND-ADOL',
    instrument: 'SCAS',
    population: 'Indian Adolescent (12-17)',
    sampleSize: 6300,
    dateRange: 'Jun 2024 - Oct 2025',
    demographicNote: 'School students from CBSE, ICSE, and state boards; 54% female, 46% male; 6 states; urban & semi-urban',
    rows: [
      { rawScore: 0, tScore: 32, percentile: 3, severity: 'None', ci95: '29-35' },
      { rawScore: 10, tScore: 40, percentile: 16, severity: 'Minimal', ci95: '37-43' },
      { rawScore: 20, tScore: 48, percentile: 42, severity: 'Mild', ci95: '45-51' },
      { rawScore: 30, tScore: 55, percentile: 69, severity: 'Moderate', ci95: '52-58' },
      { rawScore: 45, tScore: 63, percentile: 90, severity: 'High', ci95: '60-66' },
      { rawScore: 60, tScore: 70, percentile: 97, severity: 'Very High', ci95: '67-73' },
      { rawScore: 80, tScore: 78, percentile: 99, severity: 'Clinical Range', ci95: '75-81' },
    ],
  },
];

const populationOptions = ['Indian Adult', 'Indian Adolescent', 'Industry-specific'];
const ageOptions = ['12-17', '18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
const genderOptions = ['All', 'Male', 'Female', 'Non-binary'];
const educationOptions = ['All', 'Below Secondary', 'Secondary', 'Graduate', 'Post-graduate'];

const severityColors: Record<string, string> = {
  'None': 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  'Minimal': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Mild': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Below Average': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Moderate': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Average': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Above Average': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Moderately Severe': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'High': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Very Low': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Low': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Very High': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Severe': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Very Severe': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'Clinical Range': 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NormsPage() {
  const [selectedInstrument, setSelectedInstrument] = useState('PHQ-9');
  const [selectedPopulation, setSelectedPopulation] = useState('Indian Adult');
  const [selectedAge, setSelectedAge] = useState('All');
  const [selectedGender, setSelectedGender] = useState('All');
  const [selectedEducation, setSelectedEducation] = useState('All');

  const activeTable = normTables.find((t) => t.instrument === selectedInstrument) || normTables[0];

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Question Bank</span>
          <span>/</span>
          <span className="text-foreground font-medium">Norm Tables</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Norm Tables</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse normative data across instruments, populations, and demographics.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[
          { label: 'Total Norm Groups', value: '47', icon: Database, change: '12 added this quarter' },
          { label: 'Questionnaires Normed', value: '23', icon: BookOpen, change: 'Across 4 verticals' },
          { label: 'Population Coverage', value: '1,18,400', icon: Users, change: '11 languages, 18 states' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Norm Group Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Norm Group Selector
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Instrument</label>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              >
                {normTables.map((t) => (
                  <option key={t.id} value={t.instrument}>{t.instrument}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Population</label>
              <select
                value={selectedPopulation}
                onChange={(e) => setSelectedPopulation(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              >
                {populationOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Age Band</label>
              <select
                value={selectedAge}
                onChange={(e) => setSelectedAge(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              >
                <option value="All">All Ages</option>
                {ageOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Gender</label>
              <select
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              >
                {genderOptions.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Education</label>
              <select
                value={selectedEducation}
                onChange={(e) => setSelectedEducation(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              >
                {educationOptions.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Norm Table Display */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {activeTable.instrument} &mdash; {activeTable.population}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" size="sm">n = {activeTable.sampleSize.toLocaleString()}</Badge>
              <Badge variant="primary" appearance="light" size="sm">{activeTable.dateRange}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Raw Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">T-Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Percentile</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Severity Classification</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">95% CI</th>
                </tr>
              </thead>
              <tbody>
                {activeTable.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold">{row.rawScore}</td>
                    <td className="px-5 py-3 font-mono text-xs">{row.tScore}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{row.percentile}%</span>
                        <div className="hidden sm:block w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60"
                            style={{ width: `${row.percentile}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                        severityColors[row.severity] || 'bg-gray-100 text-gray-700'
                      )}>
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{row.ci95}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Norm Disclosure */}
      <Card>
        <CardContent className="p-5">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Info className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Norm Disclosure</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                These norms are based on <strong>{activeTable.population}</strong> with{' '}
                <strong>n = {activeTable.sampleSize.toLocaleString()}</strong>.
                Administered <strong>{activeTable.dateRange}</strong>.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {activeTable.demographicNote}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                <FileText className="h-3 w-3 inline mr-1" />
                T-Scores have a mean of 50 and standard deviation of 10. Confidence intervals are computed at the 95% level using standard error of measurement (SEM).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
