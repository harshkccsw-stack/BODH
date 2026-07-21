import axios from "axios";
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export type QuestionContentType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'URL';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches MqtScoreRequest on the backend. */
export interface MqtScorePayload {
  measuredQualityTypeId: number;
  score: number;
}

/** Matches MqtScoreResponse on the backend. */
export interface MqtScoreView {
  measuredQualityTypeId: number;
  measuredQualityTypeName: string;
  score: number;
}

/** Matches QuestionOptionRequest on the backend; list order = display order. */
export interface QuestionOptionPayload {
  optionText: string | null;
  contentType: QuestionContentType;
  mediaUrl: string | null;
  mqtScores: MqtScorePayload[];
}

/**
 * Matches QuestionRequest on the backend. Questions are standalone bank
 * items — attaching them to a questionnaire is a separate flow.
 */
export interface QuestionPayload {
  contentType: QuestionContentType;
  stem: string;
  mediaUrl: string | null;
  riskFlag: boolean;
  options: QuestionOptionPayload[];
  mqtScores: MqtScorePayload[];
}

/** Matches QuestionOptionResponse on the backend. */
export interface QuestionOptionResponse {
  optionId: number;
  optionText: string | null;
  contentType: QuestionContentType;
  mediaUrl: string | null;
  sortOrder: number;
  mqtScores: MqtScoreView[];
}

/** One questionnaire that uses a bank question. */
export interface UsedInRef {
  questionnaireId: number;
  name: string;
}

/**
 * Matches QuestionResponse on the backend. usedIn lists every questionnaire
 * the question appears in (empty = unattached). sectionId/sortOrder are only
 * set when reading through one questionnaire (getByQuestionnaireId) — they
 * are that questionnaire's placement, meaningless in bank-wide reads.
 */
export interface QuestionResponse {
  questionId: number;
  usedIn: UsedInRef[];
  sectionId: number | null;
  sortOrder: number | null;
  contentType: QuestionContentType;
  stem: string;
  mediaUrl: string | null;
  riskFlag: boolean;
  options: QuestionOptionResponse[];
  mqtScores: MqtScoreView[];
}

//question apis
function getAllQuestions() {
  return axios.get<QuestionResponse[]>(`${API_URL}/questions/getAll`);
}

function getQuestionById(id: number) {
  return axios.get<QuestionResponse>(`${API_URL}/questions/getById/${id}`);
}

function createQuestion(question: QuestionPayload) {
  return axios.post<QuestionResponse>(`${API_URL}/questions/create`, question);
}

/** All-or-nothing: the backend validates every item before writing any. */
function bulkCreateQuestions(questions: QuestionPayload[]) {
  return axios.post<QuestionResponse[]>(`${API_URL}/questions/bulk-create`, questions);
}

function updateQuestion(id: number, question: QuestionPayload) {
  return axios.put<QuestionResponse>(`${API_URL}/questions/update/${id}`, question);
}

function deleteQuestion(id: number) {
  return axios.delete<void>(`${API_URL}/questions/delete/${id}`);
}

//question wrt questionnaire apis
function getQuestionsByQuestionnaireId(questionnaireId: number) {
  return axios.get<QuestionResponse[]>(`${API_URL}/questions/getByQuestionnaireId/${questionnaireId}`);
}


export const questionApis = {
  getAllQuestions,
  getQuestionById,
  createQuestion,
  bulkCreateQuestions,
  updateQuestion,
  deleteQuestion,
  getQuestionsByQuestionnaireId,
};
