// An error with an HTTP status attached. Throw it anywhere in a request
// handler; errorHandler turns it into the JSON response.
export class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
