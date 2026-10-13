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
  /**
   * NUMBER only — the inclusive range the answer must fall in; null = no
   * limit at that end. Decimals allowed. Ignored and cleared on other types.
   * Once a field has answers, a new range must still contain all of them
   * (409 otherwise).
   */
  numberMin: number | null;
  numberMax: number | null;
}

/** Matches DemographicFieldResponse on the backend. */
export interface DemographicFieldResponse {
  demographicFieldId: number;
  label: string;
  fieldType: DemographicFieldType;
  placeholder: string | null;
  options: string[];
  otherOptionLabel: string | null;
  numberMin: number | null;
  numberMax: number | null;
}

/**
 * A Number field's range in words — "from 18 to 60", "of 18 or more",
 * "up to 100" — or null with none. Word for word what the portal warns and
 * the server's 400 says (DemographicField.numberRangePhrase).
 */
export const numberRangePhrase = (min: number | null, max: number | null): string | null => {
  if (min != null && max != null) return `from ${min} to ${max}`;
  if (min != null) return `of ${min} or more`;
  return max != null ? `up to ${max}` : null;
};

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
