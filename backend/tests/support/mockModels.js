import { fileURLToPath } from "node:url";
import { jest } from "@jest/globals";

// Absolute paths, so mocks register the same way whichever test file calls this.
const src = (path) => fileURLToPath(new URL(`../../src/${path}`, import.meta.url));

// A stand-in for a Mongoose query: chainable like one (.populate().sort()...)
// and awaitable to the given value.
export const query = (value) => {
  const q = {
    populate: () => q,
    sort: () => q,
    select: () => q,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return q;
};

const modelMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn()
});

// Must be called before the app is imported, so its imports pick up the mocks.
export const mockModels = () => {
  const models = { User: modelMock(), Repository: modelMock(), Issue: modelMock() };

  jest.unstable_mockModule(src("models/user.model.js"), () => ({ User: models.User }));
  jest.unstable_mockModule(src("models/repo.model.js"), () => ({ Repository: models.Repository }));
  jest.unstable_mockModule(src("models/issue.model.js"), () => ({ Issue: models.Issue }));

  return models;
};

// Every method defaults to resolving to null, so a test only stubs what it cares about.
export const resetModels = (models) => {
  for (const model of Object.values(models)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
      fn.mockImplementation(() => query(null));
    }
  }
};
