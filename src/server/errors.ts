/** Errors that map to a 4xx response. Anything else is a 500. */
export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new DomainError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new DomainError(409, "conflict", message);
export const invalid = (message: string, details?: unknown) => new DomainError(400, "invalid", message, details);
