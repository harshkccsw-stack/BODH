import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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
  return axios.get<DemographicFieldResponse[]>(`${API_URL}/demographic-fields/getAll`);
}

function getDemographicFieldById(id: number) {
  return axios.get<DemographicFieldResponse>(`${API_URL}/demographic-fields/getById/${id}`);
}

function createDemographicField(payload: DemographicFieldPayload) {
  return axios.post<DemographicFieldResponse>(`${API_URL}/demographic-fields/create`, payload);
}

function updateDemographicField(id: number, payload: DemographicFieldPayload) {
  return axios.put<DemographicFieldResponse>(`${API_URL}/demographic-fields/update/${id}`, payload);
}

function deleteDemographicField(id: number) {
  return axios.delete<void>(`${API_URL}/demographic-fields/delete/${id}`);
}

export const demographicsApi = {
  getDemographicFields,
  getDemographicFieldById,
  createDemographicField,
  updateDemographicField,
  deleteDemographicField,
};
