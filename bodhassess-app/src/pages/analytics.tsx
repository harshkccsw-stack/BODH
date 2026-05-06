import { Search, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const exampleQueries = [
  "What's the average PHQ-9 score across all clients this month?",
  'Show me candidates with learning agility > 75th percentile',
  'How many assessments were completed last week by vertical?',
  'Which clinicians have the highest session completion rate?',
];

interface ResultRow {
  name: string;
  instrument: string;
  score: number;
  percentile: string;
  date: string;
}
const results: ResultRow[] = [];

export default function AnalyticsPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">BodhLens Analytics</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">BodhLens</h1>
          <Badge variant="info" appearance="light" size="sm">
            <Sparkles className="h-3 w-3" />
            Powered by Claude API
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Ask questions about your assessment data in plain English.
        </p>
      </div>

      {/* Query Input */}
      <Card>
        <CardContent className="p-5">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Ask a question about your assessment data..."
              />
            </div>
            <Button variant="primary">
              <Sparkles className="h-4 w-4" />
              Ask BodhLens
            </Button>
          </div>
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Example queries:</p>
            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((q) => (
                <button
                  key={q}
                  className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Query Results</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {results.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Ask a question above to see results.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Percentile</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.name} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3 font-medium">{r.name}</td>
                      <td className="px-5 py-3">{r.instrument}</td>
                      <td className="px-5 py-3 font-mono text-xs">{r.score}</td>
                      <td className="px-5 py-3">{r.percentile}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
