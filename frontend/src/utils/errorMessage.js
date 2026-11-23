// Turns an Axios error from the API into one line to show the user. For a
// 400 from request validation, the first field error is more useful than the
// generic "Validation failed".
const errorMessage = (err, fallback) => {
  const data = err?.response?.data;
  const firstFieldError = data?.errors ? Object.values(data.errors).flat()[0] : null;
  return firstFieldError ?? data?.message ?? fallback;
};

export default errorMessage;
