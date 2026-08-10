import { api } from '@/lib/apiClient';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches QuestionnaireRequest on the backend. */
export interface QuestionnairePayload {
  name: string;
  shortName: string | null;
  category: string | null;
  vertical: string | null;
  description: string | null;
  durationMinutes: number | null;
  generalInstruction: string | null;
  hasSections: boolean;
}

/** Matches QuestionnaireResponse on the backend. */
export interface QuestionnaireResponse {
  questionnaireId: number;
  name: string;
  shortName: string | null;
  category: string | null;
  vertical: string | null;
  description: string | null;
  durationMinutes: number | null;
  generalInstruction: string | null;
  hasSections: boolean;
  questionCount: number;
}

function getQuestionnaires() {
  return api.get<QuestionnaireResponse[]>(`/questionnaire/getAll`);
}

function getQuestionnaireById(id: number) {
  return api.get<QuestionnaireResponse>(`/questionnaire/getById/${id}`);
}

function createQuestionnaire(payload: QuestionnairePayload) {
  return api.post<QuestionnaireResponse>(`/questionnaire/create`, payload);
}

function updateQuestionnaire(id: number, payload: QuestionnairePayload) {
  return api.put<QuestionnaireResponse>(`/questionnaire/update/${id}`, payload);
}

function deleteQuestionnaire(id: number) {
  return api.delete<void>(`/questionnaire/delete/${id}`);
}

// ── Demographic form mapping ───────────────────────────────────────────────
/** Matches QuestionnaireDemographicFieldRequest; list order becomes sortOrder. */
export interface QuestionnaireDemographicFieldEntry {
  demographicFieldId: number;
  required: boolean;
}

/** Matches QuestionnaireDemographicFieldResponse on the backend. */
export interface QuestionnaireDemographicFieldResponse {
  demographicFieldId: number;
  label: string;
  fieldType: string;
  required: boolean;
  sortOrder: number;
}

function getQuestionnaireDemographicFields(questionnaireId: number) {
  return api.get<QuestionnaireDemographicFieldResponse[]>(`/questionnaire/${questionnaireId}/demographic-fields`,
  );
}

/** Replace-all: the questionnaire's form becomes exactly this list. */
function setQuestionnaireDemographicFields(
  questionnaireId: number,
  entries: QuestionnaireDemographicFieldEntry[],
) {
  return api.put<QuestionnaireDemographicFieldResponse[]>(`/questionnaire/${questionnaireId}/demographic-fields`,
    entries,
  );
}

// ── Sections ───────────────────────────────────────────────────────────────
/** Matches SectionResponse on the backend. */
export interface SectionResponse {
  sectionId: number;
  name: string;
  instruction: string | null;
}

function getQuestionnaireSections(questionnaireId: number) {
  return api.get<SectionResponse[]>(`/questionnaire/${questionnaireId}/sections`);
}

function createQuestionnaireSection(questionnaireId: number, payload: { name: string; instruction: string | null }) {
  return api.post<SectionResponse>(`/questionnaire/${questionnaireId}/sections`, payload);
}

/** Questions in the section survive — they detach to the questionnaire root. */
function deleteQuestionnaireSection(questionnaireId: number, sectionId: number) {
  return api.delete<void>(`/questionnaire/${questionnaireId}/sections/${sectionId}`);
}

// ── Question mapping ───────────────────────────────────────────────────────
/** Matches QuestionnaireQuestionRequest; the PUT carries the full mapping. */
export interface QuestionnaireQuestionEntry {
  questionId: number;
  sectionId: number | null;
  sortOrder: number;
}

/** Replace-all: attaches listed bank questions, detaches everything else. */
function setQuestionnaireQuestions(questionnaireId: number, entries: QuestionnaireQuestionEntry[]) {
  return api.put<{ attached: number }>(`/questionnaire/${questionnaireId}/questions`, entries);
}

export const questionnairesApi = {
  getQuestionnaires,
  getQuestionnaireById,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
  getQuestionnaireDemographicFields,
  setQuestionnaireDemographicFields,
  getQuestionnaireSections,
  createQuestionnaireSection,
  deleteQuestionnaireSection,
  setQuestionnaireQuestions,
};
