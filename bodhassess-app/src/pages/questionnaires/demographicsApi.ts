import { api } from '@/lib/apiClient';

export type DemographicFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKLIST';

/** DROPDOWN (pick one) and CHECKLIST (tick any number) are the types with options. */
export const hasChoices = (t: DemographicFieldType) => t === 'DROPDOWN' || t === 'CHECKLIST';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches DemographicFieldRequest on the backend. */
export interface DemographicFieldPayload {
  label: string;
  fieldType: DemographicFieldType;
  placeholder: string | null;
  /** Only read for DROPDOWN / CHECKLIST; display order = list order. */
  options: string[];
  /**
   * The write-in "Other" choice, delivered after the options with a text box
   * the respondent must fill once they pick it. null = none. Not one of
   * `options` — a plain "Other" with no text box is just an option.
   */
  otherOptionLabel: string | null;
}

/** Matches DemographicFieldResponse on the backend. */
export interface DemographicFieldResponse {
  demographicFieldId: number;
  label: string;
  fieldType: DemographicFieldType;
  placeholder: string | null;
  options: string[];
  otherOptionLabel: string | null;
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
