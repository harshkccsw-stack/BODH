import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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
  return axios.get<QuestionnaireResponse[]>(`${API_URL}/questionnaire/getAll`);
}

function getQuestionnaireById(id: number) {
  return axios.get<QuestionnaireResponse>(`${API_URL}/questionnaire/getById/${id}`);
}

function createQuestionnaire(payload: QuestionnairePayload) {
  return axios.post<QuestionnaireResponse>(`${API_URL}/questionnaire/create`, payload);
}

function updateQuestionnaire(id: number, payload: QuestionnairePayload) {
  return axios.put<QuestionnaireResponse>(`${API_URL}/questionnaire/update/${id}`, payload);
}

function deleteQuestionnaire(id: number) {
  return axios.delete<void>(`${API_URL}/questionnaire/delete/${id}`);
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
  return axios.get<QuestionnaireDemographicFieldResponse[]>(
    `${API_URL}/questionnaire/${questionnaireId}/demographic-fields`,
  );
}

/** Replace-all: the questionnaire's form becomes exactly this list. */
function setQuestionnaireDemographicFields(
  questionnaireId: number,
  entries: QuestionnaireDemographicFieldEntry[],
) {
  return axios.put<QuestionnaireDemographicFieldResponse[]>(
    `${API_URL}/questionnaire/${questionnaireId}/demographic-fields`,
    entries,
  );
}

export const questionnairesApi = {
  getQuestionnaires,
  getQuestionnaireById,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
  getQuestionnaireDemographicFields,
  setQuestionnaireDemographicFields,
};
