// Erros de domínio: a camada HTTP decide qual status cada um vira.
export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}
