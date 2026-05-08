import {
  Plus,
  Layers,
  BarChart3,
  Link2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CompetencyMapping {
  competency: string;
  instrument: string;
  subscale: string;
  weight: number;
}

interface Framework {
  id: string;
  role: string;
  competencies: { name: string; weight: number }[];
  instruments: string[];
  mappings: CompetencyMapping[];
}

const frameworks: Framework[] = [];

export default function CompetencyFrameworksPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Industrial</span>
          <span>/</span>
          <span className="text-foreground font-medium">Competency Frameworks</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Competency Frameworks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define role-based competency models and map them to validated psychometric instruments.
            </p>
          </div>
          <Button variant="primary" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Framework
          </Button>
        </div>
      </div>

      {/* Framework Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {frameworks.length === 0 && (
          <Card className="lg:col-span-3">
            <CardContent className="p-10 text-center">
              <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">No competency frameworks defined</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a framework to map role competencies to validated instruments.
              </p>
            </CardContent>
          </Card>
        )}
        {frameworks.map((fw) => (
          <Card key={fw.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">{fw.role}</CardTitle>
                    <p className="text-xs text-muted-foreground">{fw.id}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Competency badges */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Competencies</p>
                <div className="flex flex-wrap gap-1.5">
                  {fw.competencies.map((comp) => (
                    <Badge key={comp.name} variant="outline" className="text-xs">
                      {comp.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Instruments linked */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  Instruments Linked
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {fw.instruments.map((inst) => (
                    <Badge key={inst} variant="secondary" className="text-xs">
                      {inst}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Weight distribution */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <BarChart3 className="h-3 w-3" />
                  Weight Distribution
                </p>
                <div className="space-y-1.5">
                  {fw.competencies.map((comp) => (
                    <div key={comp.name} className="flex items-center gap-2">
                      <span className="text-xs w-32 truncate text-muted-foreground">{comp.name}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${comp.weight}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono w-8 text-right">{comp.weight}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Mapping Tables */}
      {frameworks.map((fw) => (
        <Card key={fw.id + '-mapping'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                {fw.role} — Competency-to-Instrument Mapping
              </CardTitle>
              <span className="text-xs text-muted-foreground">{fw.id}</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Competency</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Subscale / Factor</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {fw.mappings.map((m) => (
                    <tr
                      key={m.competency}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium">{m.competency}</td>
                      <td className="px-5 py-3">{m.instrument}</td>
                      <td className="px-5 py-3 text-muted-foreground">{m.subscale}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${m.weight * 4}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{m.weight}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
