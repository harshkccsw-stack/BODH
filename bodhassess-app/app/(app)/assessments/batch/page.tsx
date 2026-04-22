'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type UploadState = 'idle' | 'preview' | 'uploading' | 'done';

interface PreviewRow {
  email: string;
  name: string;
  instrument: string;
  language: string;
  status?: 'success' | 'error';
  message?: string;
}

const mockPreviewRows: PreviewRow[] = [
  { email: 'arjun.patel@example.com', name: 'Arjun Patel', instrument: 'PHQ-9', language: 'Hindi' },
  { email: 'priya.sharma@example.com', name: 'Priya Sharma', instrument: 'GAD-7', language: 'English' },
  { email: 'rahul.verma@example.com', name: 'Rahul Verma', instrument: 'DASS-21', language: 'English' },
  { email: 'ananya.reddy@example.com', name: 'Ananya Reddy', instrument: 'Beck BDI-II', language: 'Telugu' },
  { email: 'vikram.singh@example.com', name: 'Vikram Singh', instrument: 'Big Five IPIP-NEO', language: 'English' },
];

const mockResultRows: PreviewRow[] = [
  { email: 'arjun.patel@example.com', name: 'Arjun Patel', instrument: 'PHQ-9', language: 'Hindi', status: 'success', message: 'Session created, invitation sent' },
  { email: 'priya.sharma@example.com', name: 'Priya Sharma', instrument: 'GAD-7', language: 'English', status: 'success', message: 'Session created, invitation sent' },
  { email: 'rahul.verma@example.com', name: 'Rahul Verma', instrument: 'DASS-21', language: 'English', status: 'success', message: 'Session created, invitation sent' },
  { email: 'ananya.reddy@example.com', name: 'Ananya Reddy', instrument: 'Beck BDI-II', language: 'Telugu', status: 'success', message: 'Session created, invitation sent' },
  { email: 'vikram.singh@example.com', name: 'Vikram Singh', instrument: 'Big Five IPIP-NEO', language: 'English', status: 'success', message: 'Session created, invitation sent' },
];

export default function BatchUploadPage() {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = () => {
    setUploadState('preview');
  };

  const handleUpload = () => {
    setUploadState('uploading');
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploadState('done');
          return 100;
        }
        return prev + 20;
      });
    }, 400);
  };

  const handleReset = () => {
    setUploadState('idle');
    setProgress(0);
  };

  const rows = uploadState === 'done' ? mockResultRows : mockPreviewRows;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button
            onClick={() => { window.location.href = '/assessments'; }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Assessments
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <a href="/assessments" className="hover:text-foreground transition-colors">Assessments</a>
          <span>/</span>
          <span className="text-foreground font-medium">Batch Upload</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Batch Upload</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV file to create multiple assessments at once.
        </p>
      </div>

      {/* Upload Area */}
      {uploadState === 'idle' && (
        <Card>
          <CardContent className="p-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(); }}
              onClick={handleFileSelect}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-base font-semibold">
                    Drop your CSV file here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supported format: .csv (max 500 rows per upload)
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center mt-4">
              <Button variant="outline" size="md">
                <Download className="size-4" />
                Download CSV Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Bar */}
      {uploadState === 'uploading' && (
        <Card>
          <CardContent className="p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  <FileSpreadsheet className="size-4 text-primary" />
                  Processing batch_sessions.csv
                </span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Creating sessions and sending invitations...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Summary */}
      {uploadState === 'done' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">5</p>
                  <p className="text-sm text-muted-foreground">Assessments Created</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">5</p>
                  <p className="text-sm text-muted-foreground">Invitations Sent</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">0</p>
                  <p className="text-sm text-muted-foreground">Errors</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Column Mapping / Preview Table */}
      {(uploadState === 'preview' || uploadState === 'done') && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-primary" />
                {uploadState === 'done' ? 'Upload Results' : 'Column Mapping Preview'}
              </CardTitle>
              <div className="flex items-center gap-2">
                {uploadState === 'done' && (
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <Upload className="size-3.5" />
                    Upload Another
                  </Button>
                )}
                {uploadState === 'preview' && (
                  <Button variant="outline" size="sm" onClick={handleReset}>
                    <X className="size-3.5" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Language</th>
                    {uploadState === 'done' && (
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.email}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-5 py-3 font-mono text-xs">{row.email}</td>
                      <td className="px-5 py-3 font-medium">{row.name}</td>
                      <td className="px-5 py-3">{row.instrument}</td>
                      <td className="px-5 py-3 text-muted-foreground">{row.language}</td>
                      {uploadState === 'done' && (
                        <td className="px-5 py-3">
                          <Badge
                            size="sm"
                            shape="circle"
                            variant={row.status === 'success' ? 'success' : 'destructive'}
                            appearance="light"
                          >
                            {row.status === 'success' ? 'Created' : 'Error'}
                          </Badge>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload Action */}
      {uploadState === 'preview' && (
        <div className="flex items-center justify-end gap-3">
          <p className="text-sm text-muted-foreground mr-auto">
            5 rows detected. Review the mapping above before uploading.
          </p>
          <Button variant="outline" size="md" onClick={handleReset}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleUpload}>
            <Upload className="size-4" />
            Upload &amp; Create Assessments
          </Button>
        </div>
      )}
    </div>
  );
}
