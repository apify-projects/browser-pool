import { SessionType } from './types.js';

export class UnsupportedSessionError extends Error {
    constructor(type: SessionType) {
        super(`Unsupported session type: ${type}`);
    }
}
