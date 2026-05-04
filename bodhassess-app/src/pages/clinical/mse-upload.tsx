import { useState } from 'react';
import {
  Upload,
  FileText,
  Brain,
  CheckCircle,
  Sparkles,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'complete';

const mockExtractedFindings = {
  presentingComplaints: [
    'Persistent low mood for the past 3 months',
    'Sleep disturbance — early morning awakening',
    'Reduced appetite and 4kg weight loss',
    'Difficulty concentrating at work',
  ],
  moodAffect: {
    mood: 'Depressed',
    affect: 'Constricted, tearful at times',
    congruence: 'Mood-congruent',
  },
  riskIndicators: [
    { label: 'Suicidal ideation', level: 'Moderate', detail: 'Passive thoughts, no active plan' },
    { label: 'Self-harm', level: 'Low', detail: 'No current or recent history' },
    { label: 'Harm to others', level: 'None', detail: 'Denied' },
  ],
};

const mockRecommendedBattery = [
  { instrument: 'PHQ-9', reason: 'Quantify depression severity (self-report screening)' },
  { instrument: 'GAD-7', reason: 'Comorbid anxiety assessment' },
  { instrument: 'Beck BDI-II', reason: 'Comprehensive depression inventory with cognitive items' },
];

export default function MSEUploadPage() {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const simulateUpload = (name: string) => {
    setFileName(name);
    setUploadState('uploading');
    setTimeout(() => setUploadState('analyzing'), 1200);
    setTimeout(() => setUploadState('complete'), 2800);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) simulateUpload(file.name);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) simulateUpload(file.name);
  };

  const resetUpload = () => {
    setUploadState('idle');
    setFileName('');
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Clinical</span>
          <span>/</span>
          <span className="text-foreground font-medium">MSE Upload</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">MSE Upload</h1>
          <Badge variant="info" appearance="light" size="sm">
            <Sparkles className="h-3 w-3" />
            Tier 5 Premium
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Upload Mental Status Examination reports for AI-powered assessment battery recommendation.
        </p>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload MSE Report</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {uploadState === 'idle' && (
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('mse-file-input')?.click()}
            >
              <input
                id="mse-file-input"
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt"
                onChange={handleFileInput}
              />
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium">Drag & drop your MSE report here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse files</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Badge variant="secondary" appearance="outline" size="xs">PDF</Badge>
                <Badge variant="secondary" appearance="outline" size="xs">DOCX</Badge>
                <Badge variant="secondary" appearance="outline" size="xs">TXT</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Supported formats: PDF, DOCX, TXT — English or Hindi
              </p>
            </div>
          )}

          {uploadState === 'uploading' && (
            <div className="border border-border rounded-lg p-8 text-center">
              <div className="animate-pulse flex flex-col items-center">
                <FileText className="h-10 w-10 text-primary mb-4" />
                <p className="text-sm font-medium">Uploading {fileName}...</p>
                <div className="w-48 h-1.5 bg-muted rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-[loading_1.2s_ease-in-out]" style={{ width: '70%' }} />
                </div>
              </div>
            </div>
          )}

          {uploadState === 'analyzing' && (
            <div className="border border-border rounded-lg p-8 text-center">
              <div className="flex flex-col items-center">
                <Brain className="h-10 w-10 text-primary mb-4 animate-pulse" />
                <p className="text-sm font-medium">Analyzing MSE report with AI...</p>
                <p className="text-xs text-muted-foreground mt-1">Extracting clinical findings and generating recommendations</p>
                <div className="flex gap-1 mt-4">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {uploadState === 'complete' && (
            <div className="border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{fileName}</p>
                    <p className="text-xs text-muted-foreground">Analysis complete</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={resetUpload}>
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results — only show after analysis complete */}
      {uploadState === 'complete' && (
        <>
          {/* Recommended Battery */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">AI-Suggested Assessment Battery</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on MSE analysis, we recommend:
              </p>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="space-y-3">
                {mockRecommendedBattery.map((item) => (
                  <div
                    key={item.instrument}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.instrument}</p>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                    </div>
                    <Badge variant="success" appearance="light" size="sm">Recommended</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Extracted Findings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Presenting Complaints */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Presenting Complaints</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <ul className="space-y-2">
                  {mockExtractedFindings.presentingComplaints.map((complaint, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {complaint}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Mood & Affect */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mood & Affect</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Mood</span>
                    <span className="font-medium">{mockExtractedFindings.moodAffect.mood}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Affect</span>
                    <span className="font-medium">{mockExtractedFindings.moodAffect.affect}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Congruence</span>
                    <span className="font-medium">{mockExtractedFindings.moodAffect.congruence}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Risk Indicators */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <CardTitle className="text-base">Risk Indicators</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Risk Area</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Level</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockExtractedFindings.riskIndicators.map((indicator) => (
                      <tr key={indicator.label} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3 font-medium">{indicator.label}</td>
                        <td className="px-5 py-3">
                          <Badge
                            variant={
                              indicator.level === 'Moderate' ? 'warning' :
                              indicator.level === 'Low' ? 'success' : 'secondary'
                            }
                            appearance="light"
                            size="sm"
                          >
                            {indicator.level}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{indicator.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Action */}
          <div className="flex justify-end">
            <Button variant="primary" size="lg">
              <CheckCircle className="h-4 w-4" />
              Approve Battery & Create Assessments
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
