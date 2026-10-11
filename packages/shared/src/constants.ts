export const GAME_NAME = 'CORPORATE SUS';
export const TAGLINE = 'Trust Nobody. Especially Management.';

/** Authoritative simulation rate. Clients predict with the same fixed step. */
export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const TICK_DT = 1 / TICK_HZ;

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

export const PLAYER_RADIUS = 0.3;
/** Base walking speed in logical world units (tiles) per second. */
export const BASE_SPEED = 3.4;
/** How quickly velocity approaches the target velocity (1/s). */
export const ACCELERATION = 16;

export const INTERACT_RANGE = 1.45;
export const REPORT_RANGE = 2.2;
export const EMERGENCY_RANGE = 2.4;
export const VENT_RANGE = 1.1;
/** A task session closes if the player drifts further than this from the station. */
export const TASK_LEASH = 2.4;

export const BASE_VISION = 6.5;
export const LIGHTS_OUT_VISION_FACTOR = 0.38;

export const VOICE_RADIUS = 5;
export const VOICE_FULL_VOLUME_RADIUS = 1.5;

export const RECONNECT_GRACE_MS = 45_000;
export const LOBBY_RECONNECT_GRACE_MS = 20_000;

export const ROLE_REVEAL_MS = 5_000;
export const STARTING_MS = 3_000;
export const MEETING_INTRO_MS = 3_500;
export const VOTE_RESULTS_MS = 7_000;
export const GAME_OVER_AUTO_RETURN_MS = 60_000;
export const RETURNING_MS = 1_500;

export const KILL_GRACE_AFTER_START_MS = 10_000;
export const EMERGENCY_GRACE_MS = 15_000;
export const SABOTAGE_GRACE_AFTER_START_MS = 10_000;

export const CRITICAL_SABOTAGE_MS = 45_000;
export const DOOR_LOCK_MS = 12_000;
export const VENT_COOLDOWN_MS = 800;

export const CHAT_MAX_LEN = 200;
export const NAME_MIN_LEN = 2;
export const NAME_MAX_LEN = 16;

/** Room codes avoid ambiguous glyphs (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
