/**
 * Domain Errors
 * Custom error types for domain layer
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

