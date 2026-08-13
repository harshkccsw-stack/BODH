import { api } from '@/lib/apiClient';

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
  return api.get<MeasuredQualityResponse[]>(`/qualities/getAll`);
}

function getQualityById(id: number) {
  return api.get<MeasuredQualityResponse>(`/qualities/getById/${id}`);
}

function createQuality(quality: MeasuredQualityPayload) {
  return api.post<MeasuredQualityResponse>(`/qualities/create`, quality);
}

function updateQuality(id: number, quality: MeasuredQualityPayload) {
  return api.put<MeasuredQualityResponse>(`/qualities/update/${id}`, quality);
}

function deleteQuality(id: number) {
  return api.delete<void>(`/qualities/delete/${id}`);
}

// ── Quality Type API ───────────────────────────────────────────────────────
function getQualityTypes() {
  return api.get(`/quality-types/getAll`);
}

function getQualityTypeById(id: number) {
  return api.get<MqtNodeResponse>(`/quality-types/getById/${id}`);
}

function createQualityType(qualityType: MeasuredQualityTypePayload) {
  return api.post<MqtNodeResponse>(`/quality-types/create`, qualityType);
}

function updateQualityType(id: number, qualityType: MeasuredQualityTypePayload) {
  return api.put<MqtNodeResponse>(`/quality-types/update/${id}`, qualityType);
}

function deleteQualityType(id: number) {
  return api.delete<void>(`/quality-types/delete/${id}`);
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
