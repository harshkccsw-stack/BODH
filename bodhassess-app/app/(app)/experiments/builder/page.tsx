'use client';

import { useState } from 'react';
import {
  Play,
  Settings,
  Eye,
  Zap,
  ChevronRight,
  CheckCircle2,
  Timer,
  Shuffle,
  Layers,
  Monitor,
  Brain,
  Target,
  Hand,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Paradigm {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: React.ElementType;
}

const paradigms: Paradigm[] = [
  { id: 'iat', name: 'Implicit Association Test', shortName: 'IAT', description: 'Measures implicit attitudes and biases through categorization speed', icon: Brain },
  { id: 'dot-probe', name: 'Dot Probe Task', shortName: 'Dot Probe', description: 'Assesses attentional bias toward threat or reward stimuli', icon: Target },
  { id: 'stroop', name: 'Stroop Task', shortName: 'Stroop', description: 'Measures cognitive interference and executive control', icon: Layers },
  { id: 'go-nogo', name: 'Go/No-Go Task', shortName: 'Go/No-Go', description: 'Evaluates response inhibition and impulsivity', icon: Hand },
  { id: 'nback', name: 'N-Back Task', shortName: 'N-Back', description: 'Assesses working memory capacity and updating', icon: Monitor },
  { id: 'delay-discounting', name: 'Delay Discounting', shortName: 'Delay Discounting', description: 'Measures temporal discounting and impulsive decision-making', icon: Clock },
];

const steps = [
  { label: 'Select Paradigm', icon: Brain },
  { label: 'Configure Stimuli', icon: Settings },
  { label: 'Set Parameters', icon: Zap },
  { label: 'Preview & Launch', icon: Play },
];

const randomizationTypes = ['Full Randomization', 'Block Randomization', 'Latin Square', 'Fixed Order'];

export default function ExperimentBuilderPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedParadigm, setSelectedParadigm] = useState<string | null>(null);
  const [config, setConfig] = useState({
    trialCount: 60,
    blockCount: 3,
    stimulusDuration: 500,
    interTrialInterval: 1000,
    randomizationType: 'Full Randomization',
  });

  const selectedParadigmData = paradigms.find((p) => p.id === selectedParadigm);

  const canProceed = () => {
    if (currentStep === 0) return !!selectedParadigm;
    return true;
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
          <span className="text-foreground font-medium">Experiment Builder</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Experiment Builder</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build and configure experimental paradigms with precise timing control.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <Zap className="h-3 w-3" />
            jsPsych-powered — millisecond timing precision
          </span>
        </div>
      </div>

      {/* Step Indicator */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === currentStep;
              const isComplete = i < currentStep;
              return (
                <div key={step.label} className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => i <= currentStep && setCurrentStep(i)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      isActive && 'bg-primary/10 text-primary font-medium',
                      isComplete && 'text-green-600 dark:text-green-400 cursor-pointer',
                      !isActive && !isComplete && 'text-muted-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
                      isActive && 'bg-primary text-primary-foreground',
                      isComplete && 'bg-green-100 dark:bg-green-900/30',
                      !isActive && !isComplete && 'bg-muted'
                    )}>
                      {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {i < steps.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 0 && (
        <div>
          <h2 className="text-base font-semibold mb-4">Select a Paradigm</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {paradigms.map((paradigm) => {
              const Icon = paradigm.icon;
              const isSelected = selectedParadigm === paradigm.id;
              return (
                <Card
                  key={paradigm.id}
                  className={cn(
                    'cursor-pointer transition-all hover:shadow-md',
                    isSelected && 'ring-2 ring-primary'
                  )}
                  onClick={() => setSelectedParadigm(paradigm.id)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10'
                      )}>
                        <Icon className={cn('h-5 w-5', !isSelected && 'text-primary')} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{paradigm.shortName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{paradigm.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configure Stimuli for {selectedParadigmData?.shortName}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Stimulus Set</label>
                <select className="h-8.5 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option>Default word list</option>
                  <option>Custom image set</option>
                  <option>Emotional faces (KDEF)</option>
                  <option>Threat words (Hindi)</option>
                  <option>Neutral words (Hindi)</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Stimulus Modality</label>
                <select className="h-8.5 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option>Text</option>
                  <option>Images</option>
                  <option>Audio</option>
                  <option>Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Number of Categories</label>
                <Input type="number" defaultValue={2} className="w-full" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Items per Category</label>
                <Input type="number" defaultValue={10} className="w-full" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Practice Trials</label>
              <div className="flex items-center gap-3">
                <Input type="number" defaultValue={10} className="w-32" />
                <span className="text-xs text-muted-foreground">practice trials before main blocks</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Set Parameters</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Trial Count</label>
                <Input
                  type="number"
                  value={config.trialCount}
                  onChange={(e) => setConfig({ ...config, trialCount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Block Count</label>
                <Input
                  type="number"
                  value={config.blockCount}
                  onChange={(e) => setConfig({ ...config, blockCount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Stimulus Duration (ms)</label>
                <Input
                  type="number"
                  value={config.stimulusDuration}
                  onChange={(e) => setConfig({ ...config, stimulusDuration: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Inter-Trial Interval (ms)</label>
                <Input
                  type="number"
                  value={config.interTrialInterval}
                  onChange={(e) => setConfig({ ...config, interTrialInterval: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Randomization Type</label>
                <select
                  className="h-8.5 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={config.randomizationType}
                  onChange={(e) => setConfig({ ...config, randomizationType: e.target.value })}
                >
                  {randomizationTypes.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Response Window (ms)</label>
                <Input type="number" defaultValue={2000} />
              </div>
            </div>
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <p className="text-xs font-medium mb-2">Experiment Summary</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Paradigm</p>
                    <p className="font-medium">{selectedParadigmData?.shortName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Trials</p>
                    <p className="font-medium">{config.trialCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Est. Duration</p>
                    <p className="font-medium">{Math.round((config.trialCount * (config.stimulusDuration + config.interTrialInterval)) / 60000)} min</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Randomization</p>
                    <p className="font-medium">{config.randomizationType}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview &amp; Launch</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-5">
            <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
                <Monitor className="h-8 w-8 text-primary" />
              </div>
              <p className="font-semibold">Experiment Preview</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedParadigmData?.shortName} with {config.trialCount} trials across {config.blockCount} blocks
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Stimulus: {config.stimulusDuration}ms | ITI: {config.interTrialInterval}ms | {config.randomizationType}
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4" />
                  Preview Trial
                </Button>
                <Button variant="primary" size="sm">
                  <Play className="h-4 w-4" />
                  Launch Experiment
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <Card>
                <CardContent className="p-4 text-center">
                  <Timer className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-semibold">{config.stimulusDuration}ms</p>
                  <p className="text-xs text-muted-foreground">Stimulus Duration</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Layers className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-semibold">{config.blockCount}</p>
                  <p className="text-xs text-muted-foreground">Blocks</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Target className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-semibold">{config.trialCount}</p>
                  <p className="text-xs text-muted-foreground">Trials</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Shuffle className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-semibold text-xs">{config.randomizationType.split(' ')[0]}</p>
                  <p className="text-xs text-muted-foreground">Randomization</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          Previous
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
          disabled={!canProceed() || currentStep === steps.length - 1}
        >
          Next Step
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
