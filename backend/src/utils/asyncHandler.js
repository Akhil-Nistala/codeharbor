// Forwards a rejected promise from an async route handler to Express's error
// handler, so controllers don't each need their own try/catch.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
