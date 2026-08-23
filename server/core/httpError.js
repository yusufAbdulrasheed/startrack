/**
 * A business rule saying no, with the status and wording the client should
 * see. Throwing one from inside a transaction lets the abort happen naturally
 * on the way out, instead of forcing every check to run before the session
 * opens — where it would be reading data the transaction hasn't pinned yet.
 */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = "invalid") => new HttpError(400, code, message);
export const conflict = (message, code = "conflict") => new HttpError(409, code, message);
export const notFound = (message, code = "not_found") => new HttpError(404, code, message);
