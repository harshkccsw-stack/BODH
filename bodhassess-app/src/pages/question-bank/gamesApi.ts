import { api } from '@/lib/apiClient';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────

/** Matches GameResponse on the backend — one game of the catalog. */
export interface GameResponse {
  gameId: number;
  /** The portal's registry key: which game file renders it. Stored upper case. */
  code: string;
  name: string;
  description: string | null;
  /** Offered for NEW questions; a retired game keeps working where it is used. */
  active: boolean;
  version: number;
  /** Every bank question launching this game — any number; empty when unused. */
  usedByQuestionIds: number[];
}

/**
 * Matches GameRequest on the backend. On update, null `active` / `version`
 * mean "unchanged"; the form always sends both.
 */
export interface GamePayload {
  code: string;
  name: string;
  description: string | null;
  active: boolean | null;
  version: number | null;
}

/** Mirrors GameRequest's @Pattern: letters, digits and underscores only. */
export const GAME_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const GAME_CODE_MAX = 50;
export const GAME_NAME_MAX = 150;

/**
 * The game codes the PORTAL can actually play — a copy of the keys in
 * bodhassess-portal/src/games/registry.ts. The two apps share no module, so
 * this is duplicated on purpose: add a code here when a game file lands there.
 * Only used to WARN — the backend accepts any well-formed code, because a
 * game can be catalogued before its file ships.
 */
export const PORTAL_GAME_CODES = ['BASELINE', 'COLOR_CLASH_MACKWORTH'] as const;

export const isPlayableCode = (code: string) =>
  (PORTAL_GAME_CODES as readonly string[]).includes(code.trim().toUpperCase());

//game catalog apis
function getAllGames() {
  return api.get<GameResponse[]>(`/games/getAll`);
}

function getGameById(id: number) {
  return api.get<GameResponse>(`/games/getById/${id}`);
}

function createGame(game: GamePayload) {
  return api.post<GameResponse>(`/games/create`, game);
}

/** 409 when the code changes after a question using the game has responses. */
function updateGame(id: number, game: GamePayload) {
  return api.put<GameResponse>(`/games/update/${id}`, game);
}

/** 409 while any question still launches the game — the message names them. */
function deleteGame(id: number) {
  return api.delete<void>(`/games/delete/${id}`);
}

export const gamesApi = {
  getAllGames,
  getGameById,
  createGame,
  updateGame,
  deleteGame,
};
