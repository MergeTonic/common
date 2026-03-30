export class HydrationRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HydrationRuntimeError";
  }
}

export class OptionalAiDependencyError extends HydrationRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "OptionalAiDependencyError";
  }
}

export class HydrationPersistError extends HydrationRuntimeError {
  constructor(message: string) {
    super(message);
    this.name = "HydrationPersistError";
  }
}
