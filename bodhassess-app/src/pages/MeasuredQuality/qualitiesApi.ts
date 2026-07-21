import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces; reading it crashes the page on load.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// ── UI-side tree shapes used by the Qualities page ─────────────────────────
export interface MQT {
  id: string;
  name: string;
  children?: MQT[];
}

export interface MQ {
  id: string;
  name: string;
  description: string;
  mqts: MQT[];
}

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches MeasuredQualityRequest on the backend. */
export interface MeasuredQualityPayload {
  name: string;
  description: string | null;
}

/** Matches MqtNodeResponse on the backend — one tree node, nested children. */
export interface MqtNodeResponse {
  measuredQualityTypeId: number;
  name: string;
  children: MqtNodeResponse[];
}

/** Matches MeasuredQualityResponse on the backend. */
export interface MeasuredQualityResponse {
  measuredQualityId: number;
  name: string;
  description: string | null;
  mqts: MqtNodeResponse[];
}

/**
 * Matches MeasuredQualityTypeRequest on the backend. On create pass exactly
 * one anchor: measuredQualityId (root MQT) or parentTypeId (sub-MQT — the MQ
 * is derived from the parent). Rename reads only name.
 */
export interface MeasuredQualityTypePayload {
  measuredQualityId?: number;
  parentTypeId?: number;
  name: string;
}

// ── Quality API ────────────────────────────────────────────────────────────
function getQualities() {
  return axios.get<MeasuredQualityResponse[]>(`${API_URL}/qualities/getAll`);
}

function getQualityById(id: number) {
  return axios.get<MeasuredQualityResponse>(`${API_URL}/qualities/getById/${id}`);
}

function createQuality(quality: MeasuredQualityPayload) {
  return axios.post<MeasuredQualityResponse>(`${API_URL}/qualities/create`, quality);
}

function updateQuality(id: number, quality: MeasuredQualityPayload) {
  return axios.put<MeasuredQualityResponse>(`${API_URL}/qualities/update/${id}`, quality);
}

function deleteQuality(id: number) {
  return axios.delete<void>(`${API_URL}/qualities/delete/${id}`);
}

// ── Quality Type API ───────────────────────────────────────────────────────
function getQualityTypes() {
  return axios.get(`${API_URL}/quality-types/getAll`);
}

function getQualityTypeById(id: number) {
  return axios.get<MqtNodeResponse>(`${API_URL}/quality-types/getById/${id}`);
}

function createQualityType(qualityType: MeasuredQualityTypePayload) {
  return axios.post<MqtNodeResponse>(`${API_URL}/quality-types/create`, qualityType);
}

function updateQualityType(id: number, qualityType: MeasuredQualityTypePayload) {
  return axios.put<MqtNodeResponse>(`${API_URL}/quality-types/update/${id}`, qualityType);
}

function deleteQualityType(id: number) {
  return axios.delete<void>(`${API_URL}/quality-types/delete/${id}`);
}

export const qualitiesApi = {
  getQualities,
  getQualityById,
  createQuality,
  updateQuality,
  deleteQuality,
  getQualityTypes,
  getQualityTypeById,
  createQualityType,
  updateQualityType,
  deleteQualityType,
};
