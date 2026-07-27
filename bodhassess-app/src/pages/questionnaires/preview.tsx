import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useParams, useRouter } from '@/lib/router-helpers';
import {
  questionnairesApi,
  type QuestionnaireResponse,
  type QuestionnaireDemographicFieldResponse,
  type SectionResponse,
} from './questionnairesApi';
import { questionApis, type QuestionResponse } from '@/pages/question-bank/questionApis';
// The rendering itself is shared with the create/edit wizard's Preview popup.
import { QuestionnairePreviewView } from './questionnaire-preview-view';

export default function QuestionnairePreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qid = Number(params.id);

  const [meta, setMeta] = useState<QuestionnaireResponse | null>(null);
  const [sections, setSections] = useState<SectionResponse[]>([]);
  const [demoFields, setDemoFields] = useState<QuestionnaireDemographicFieldResponse[]>([]);
  const [questions, setQuestions] = useState<QuestionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isInteger(qid)) {
      setError('Invalid questionnaire id');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [m, s, d, q] = await Promise.all([
          questionnairesApi.getQuestionnaireById(qid),
          questionnairesApi.getQuestionnaireSections(qid),
          questionnairesApi.getQuestionnaireDemographicFields(qid),
          questionApis.getQuestionsByQuestionnaireId(qid),
        ]);
        setMeta(m.data);
        setSections(s.data);
        setDemoFields(d.data);
        setQuestions(q.data);
      } catch (e: any) {
        setError(e?.response?.status === 404 ? 'Questionnaire not found' : e?.message || 'Failed to load questionnaire');
      } finally {
        setLoading(false);
      }
    })();
  }, [qid]);

  if (loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-3">Loading preview…</p>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="p-10 max-w-lg mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error || 'Questionnaire not found'}</span>
        </div>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/questionnaires')}>
          <ArrowLeft className="h-4 w-4" /> Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-7.5 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Preview · respondent view
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/question-bank/create?edit=${meta.questionnaireId}`)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      <QuestionnairePreviewView meta={meta} sections={sections} demoFields={demoFields} questions={questions} />
    </div>
  );
}
