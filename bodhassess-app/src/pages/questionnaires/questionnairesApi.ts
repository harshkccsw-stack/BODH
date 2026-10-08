import { api } from '@/lib/apiClient';
import type { QuestionLayout } from '@/pages/assessments/assessmentApis';

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
  /**
   * Repeat the instruction above every question of the section instead of
   * only the one that opens it. Off on every section authored before the
   * flag existed.
   */
  showInstructionOnEachQuestion: boolean;
  /**
   * This section's own portal paging — one question per page, or the whole
   * section on one page. Null = the assessment's Question layout decides.
   */
  questionLayout: QuestionLayout | null;
  /** Display position, 0-based and dense. The list arrives sorted by it. */
  sortOrder: number;
}

export interface SectionPayload {
  name: string;
  instruction: string | null;
  showInstructionOnEachQuestion: boolean;
  /**
   * Required here on purpose: the section PUT replaces every field, so a
   * caller that left it out would quietly hand the section back to the
   * assessment's layout. Send null for "use the assessment's".
   */
  questionLayout: QuestionLayout | null;
}

function getQuestionnaireSections(questionnaireId: number) {
  return api.get<SectionResponse[]>(`/questionnaire/${questionnaireId}/sections`);
}

function createQuestionnaireSection(questionnaireId: number, payload: SectionPayload) {
  return api.post<SectionResponse>(`/questionnaire/${questionnaireId}/sections`, payload);
}

/** Rename / re-instruct a section. Position is untouched. */
function updateQuestionnaireSection(questionnaireId: number, sectionId: number, payload: SectionPayload) {
  return api.put<SectionResponse>(`/questionnaire/${questionnaireId}/sections/${sectionId}`, payload);
}

/**
 * Replace the display order. Must list EVERY section of the questionnaire
 * exactly once — a partial list is a 400. Returns the sections re-sorted, and
 * re-stamps the Section_A/B/C report tags on the backend.
 */
function reorderQuestionnaireSections(questionnaireId: number, sectionIds: number[]) {
  return api.put<SectionResponse[]>(`/questionnaire/${questionnaireId}/sections/order`, sectionIds);
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
  /**
   * May the respondent leave it blank? Omitted = keep what the placement had
   * (a question new to the questionnaire starts required). Once anyone has
   * started an assessment of it, optional → required is a 409.
   */
  optional?: boolean;
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
  updateQuestionnaireSection,
  reorderQuestionnaireSections,
  deleteQuestionnaireSection,
  setQuestionnaireQuestions,
};
