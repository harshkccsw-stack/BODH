'use client';

import {
  Plus,
  Layers,
  BarChart3,
  Link2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const frameworks = [
  {
    id: 'FW-001',
    role: 'Software Engineer L4',
    competencies: [
      { name: 'Analytical Thinking', weight: 25 },
      { name: 'Problem Solving', weight: 20 },
      { name: 'Communication', weight: 15 },
      { name: 'Collaboration', weight: 15 },
      { name: 'Learning Agility', weight: 15 },
      { name: 'AI Readiness', weight: 10 },
    ],
    instruments: ['Cognitive Ability Test', 'Big Five (IPIP-NEO)', 'AI Adaptability Index'],
    mappings: [
      { competency: 'Analytical Thinking', instrument: 'Cognitive Ability Test', subscale: 'Logical Reasoning', weight: 25 },
      { competency: 'Problem Solving', instrument: 'Cognitive Ability Test', subscale: 'Pattern Recognition', weight: 20 },
      { competency: 'Communication', instrument: 'Big Five (IPIP-NEO)', subscale: 'Extraversion + Agreeableness', weight: 15 },
      { competency: 'Collaboration', instrument: 'Big Five (IPIP-NEO)', subscale: 'Agreeableness + Openness', weight: 15 },
      { competency: 'Learning Agility', instrument: 'Big Five (IPIP-NEO)', subscale: 'Openness to Experience', weight: 15 },
      { competency: 'AI Readiness', instrument: 'AI Adaptability Index', subscale: 'Composite Score', weight: 10 },
    ],
  },
  {
    id: 'FW-002',
    role: 'Sales Manager',
    competencies: [
      { name: 'Persuasion', weight: 25 },
      { name: 'Emotional Intelligence', weight: 20 },
      { name: 'Resilience', weight: 20 },
      { name: 'Strategic Thinking', weight: 15 },
      { name: 'Communication', weight: 10 },
      { name: 'Drive', weight: 10 },
    ],
    instruments: ['HEXACO-PI-R', 'Emotional Intelligence Scale', 'Work Personality Index'],
    mappings: [
      { competency: 'Persuasion', instrument: 'HEXACO-PI-R', subscale: 'Extraversion', weight: 25 },
      { competency: 'Emotional Intelligence', instrument: 'Emotional Intelligence Scale', subscale: 'Composite EQ', weight: 20 },
      { competency: 'Resilience', instrument: 'Work Personality Index', subscale: 'Stress Tolerance', weight: 20 },
      { competency: 'Strategic Thinking', instrument: 'HEXACO-PI-R', subscale: 'Openness to Experience', weight: 15 },
      { competency: 'Communication', instrument: 'HEXACO-PI-R', subscale: 'Agreeableness', weight: 10 },
      { competency: 'Drive', instrument: 'Work Personality Index', subscale: 'Achievement Motivation', weight: 10 },
    ],
  },
  {
    id: 'FW-003',
    role: 'People Leader',
    competencies: [
      { name: 'Leadership', weight: 25 },
      { name: 'Empathy', weight: 20 },
      { name: 'Decision Making', weight: 20 },
      { name: 'Conflict Resolution', weight: 15 },
      { name: 'Coaching', weight: 10 },
      { name: 'Vision Setting', weight: 10 },
    ],
    instruments: ['Leadership Potential Index', 'Emotional Intelligence Scale', 'Big Five (IPIP-NEO)'],
    mappings: [
      { competency: 'Leadership', instrument: 'Leadership Potential Index', subscale: 'Leadership Drive', weight: 25 },
      { competency: 'Empathy', instrument: 'Emotional Intelligence Scale', subscale: 'Empathy Subscale', weight: 20 },
      { competency: 'Decision Making', instrument: 'Big Five (IPIP-NEO)', subscale: 'Conscientiousness', weight: 20 },
      { competency: 'Conflict Resolution', instrument: 'Emotional Intelligence Scale', subscale: 'Social Skills', weight: 15 },
      { competency: 'Coaching', instrument: 'Leadership Potential Index', subscale: 'Developmental Orientation', weight: 10 },
      { competency: 'Vision Setting', instrument: 'Big Five (IPIP-NEO)', subscale: 'Openness to Experience', weight: 10 },
    ],
  },
];

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
