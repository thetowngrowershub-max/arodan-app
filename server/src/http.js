export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}

/** Trimmed string from user input, cut to max characters ('' if not a string). */
export const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
