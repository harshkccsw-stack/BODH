import { api } from '@/lib/apiClient';

export type DemographicFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches DemographicFieldRequest on the backend. */
export interface DemographicFieldPayload {
  label: string;
  fieldType: DemographicFieldType;
  placeholder: string | null;
  /** Only read for DROPDOWN; display order = list order. */
  options: string[];
}

/** Matches DemographicFieldResponse on the backend. */
export interface DemographicFieldResponse {
  demographicFieldId: number;
  label: string;
  fieldType: DemographicFieldType;
  placeholder: string | null;
  options: string[];
}

function getDemographicFields() {
  return api.get<DemographicFieldResponse[]>(`/demographic-fields/getAll`);
}

function getDemographicFieldById(id: number) {
  return api.get<DemographicFieldResponse>(`/demographic-fields/getById/${id}`);
}

function createDemographicField(payload: DemographicFieldPayload) {
  return api.post<DemographicFieldResponse>(`/demographic-fields/create`, payload);
}

function updateDemographicField(id: number, payload: DemographicFieldPayload) {
  return api.put<DemographicFieldResponse>(`/demographic-fields/update/${id}`, payload);
}

function deleteDemographicField(id: number) {
  return api.delete<void>(`/demographic-fields/delete/${id}`);
}

export const demographicsApi = {
  getDemographicFields,
  getDemographicFieldById,
  createDemographicField,
  updateDemographicField,
  deleteDemographicField,
};
