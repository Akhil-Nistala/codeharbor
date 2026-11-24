// Repository, issue and user routes: the auth guard, ownership checks,
// visibility rules and validation.
import { jest } from "@jest/globals";
import { mockModels, query, resetModels } from "./support/mockModels.js";

const models = mockModels();
const { Issue, Repository, User } = models;

const request = (await import("supertest")).default;
const { default: app } = await import("../src/app.js");
const { signSessionToken } = await import("../src/utils/tokens.js");

const OWNER_ID = "64b000000000000000000001";
const STRANGER_ID = "64b000000000000000000002";
const REPO_ID = "64b0000000000000000000aa";
const ISSUE_ID = "64b0000000000000000000bb";

// The session JWT travels in the httpOnly "token" cookie.
const auth = (userId) => ({ Cookie: `token=${signSessionToken({ _id: userId })}` });

const repoDoc = (overrides = {}) => ({
  _id: REPO_ID,
  name: "notes",
  visibility: true,
  content: [],
  issues: [],
  owner: { toString: () => OWNER_ID },
  save: jest.fn(function () {
    return Promise.resolve(this);
  }),
  deleteOne: jest.fn().mockResolvedValue(undefined),
  ...overrides
});

beforeEach(() => resetModels(models));

describe("auth guard", () => {
  it.each([
    ["post", "/api/v1/repos"],
    ["put", `/api/v1/repos/${REPO_ID}`],
    ["delete", `/api/v1/repos/${REPO_ID}`],
    ["patch", `/api/v1/repos/${REPO_ID}/visibility`],
    ["post", `/api/v1/repos/${REPO_ID}/issues`],
    ["put", `/api/v1/issues/${ISSUE_ID}`],
    ["delete", `/api/v1/issues/${ISSUE_ID}`],
    ["put", `/api/v1/users/${OWNER_ID}`],
    ["delete", `/api/v1/users/${OWNER_ID}`],
    ["patch", `/api/v1/users/${OWNER_ID}/follow`]
  ])("%s %s returns 401 without a token", async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it("rejects a forged token", async () => {
    const res = await request(app)
      .post("/api/v1/repos")
      .set("Cookie", "token=eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IngifQ.bad")
      .send({ name: "notes" });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/repos", () => {
  it("takes the owner from the token, never from the body", async () => {
    Repository.create.mockResolvedValue({ _id: REPO_ID });

    const res = await request(app)
      .post("/api/v1/repos")
      .set(auth(OWNER_ID))
      .send({ name: "notes", owner: STRANGER_ID });

    expect(res.status).toBe(201);
    expect(res.body.repositoryID).toBe(REPO_ID);
    expect(Repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "notes", owner: OWNER_ID, visibility: true })
    );
  });

  it("returns 409 when the owner already has a repo with that name", async () => {
    Repository.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

    const res = await request(app).post("/api/v1/repos").set(auth(OWNER_ID)).send({ name: "notes" });

    expect(res.status).toBe(409);
  });

  it("rejects a blank name with 400", async () => {
    const res = await request(app).post("/api/v1/repos").set(auth(OWNER_ID)).send({ name: "  " });

    expect(res.status).toBe(400);
    expect(Repository.create).not.toHaveBeenCalled();
  });
});

describe("visibility", () => {
  it("anonymous callers only see public repos", async () => {
    Repository.find.mockReturnValue(query([]));

    await request(app).get("/api/v1/repos");

    expect(Repository.find).toHaveBeenCalledWith({ visibility: true });
  });

  it("logged-in callers also see their own private repos", async () => {
    Repository.find.mockReturnValue(query([]));

    await request(app).get("/api/v1/repos").set(auth(OWNER_ID));

    expect(Repository.find).toHaveBeenCalledWith({ $or: [{ visibility: true }, { owner: OWNER_ID }] });
  });

  it("a repo hidden from the caller is a 404", async () => {
    const res = await request(app).get(`/api/v1/repos/${REPO_ID}`).set(auth(STRANGER_ID));

    expect(res.status).toBe(404);
  });

  it("a malformed id is a 400, not a 500", async () => {
    const res = await request(app).get("/api/v1/repos/not-an-id");

    expect(res.status).toBe(400);
    expect(Repository.findOne).not.toHaveBeenCalled();
  });
});

describe("owner-only repo actions", () => {
  it("rejects a non-owner with 403", async () => {
    Repository.findById.mockReturnValue(query(repoDoc()));

    const res = await request(app).delete(`/api/v1/repos/${REPO_ID}`).set(auth(STRANGER_ID));

    expect(res.status).toBe(403);
  });

  it("lets the owner toggle visibility", async () => {
    const repo = repoDoc({ visibility: true });
    Repository.findById.mockReturnValue(query(repo));

    const res = await request(app).patch(`/api/v1/repos/${REPO_ID}/visibility`).set(auth(OWNER_ID));

    expect(res.status).toBe(200);
    expect(repo.visibility).toBe(false);
    expect(repo.save).toHaveBeenCalled();
  });
});

describe("issues", () => {
  it("opening an issue on a missing repo is a 404", async () => {
    const res = await request(app)
      .post(`/api/v1/repos/${REPO_ID}/issues`)
      .set(auth(OWNER_ID))
      .send({ title: "Bug", description: "It breaks" });

    expect(res.status).toBe(404);
    expect(Issue.create).not.toHaveBeenCalled();
  });

  it("links a new issue to its repository", async () => {
    const repo = repoDoc();
    Repository.findById.mockReturnValue(query(repo));
    Issue.create.mockResolvedValue({ _id: ISSUE_ID, title: "Bug" });

    const res = await request(app)
      .post(`/api/v1/repos/${REPO_ID}/issues`)
      .set(auth(STRANGER_ID))
      .send({ title: "Bug", description: "It breaks" });

    expect(res.status).toBe(201);
    expect(Issue.create).toHaveBeenCalledWith(
      expect.objectContaining({ repository: REPO_ID, author: STRANGER_ID })
    );
    expect(repo.issues).toEqual([ISSUE_ID]);
  });

  const issueDoc = () => ({
    _id: ISSUE_ID,
    status: "open",
    repository: REPO_ID,
    author: { toString: () => OWNER_ID },
    save: jest.fn().mockResolvedValue(undefined)
  });

  it("someone who is neither author nor repo owner can't edit an issue", async () => {
    Issue.findById.mockReturnValue(query(issueDoc()));
    Repository.findById.mockReturnValue(query(repoDoc()));

    const res = await request(app)
      .put(`/api/v1/issues/${ISSUE_ID}`)
      .set(auth(STRANGER_ID))
      .send({ status: "closed" });

    expect(res.status).toBe(403);
  });

  it("the author can close their issue", async () => {
    const issue = issueDoc();
    Issue.findById.mockReturnValue(query(issue));

    const res = await request(app)
      .put(`/api/v1/issues/${ISSUE_ID}`)
      .set(auth(OWNER_ID))
      .send({ status: "closed" });

    expect(res.status).toBe(200);
    expect(issue.status).toBe("closed");
  });

  it("rejects an unknown status with 400", async () => {
    const res = await request(app)
      .put(`/api/v1/issues/${ISSUE_ID}`)
      .set(auth(OWNER_ID))
      .send({ status: "wontfix" });

    expect(res.status).toBe(400);
  });
});

describe("users", () => {
  it("you can't edit someone else's profile", async () => {
    const res = await request(app)
      .put(`/api/v1/users/${OWNER_ID}`)
      .set(auth(STRANGER_ID))
      .send({ email: "x@example.com" });

    expect(res.status).toBe(403);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("you can't follow yourself", async () => {
    const res = await request(app).patch(`/api/v1/users/${OWNER_ID}/follow`).set(auth(OWNER_ID));

    expect(res.status).toBe(400);
  });

  it("follow adds the target to the caller's list", async () => {
    const me = { followedUsers: [], save: jest.fn().mockResolvedValue(undefined) };
    User.findById.mockImplementation((id) => query(id === OWNER_ID ? me : { _id: STRANGER_ID }));

    const res = await request(app).patch(`/api/v1/users/${STRANGER_ID}/follow`).set(auth(OWNER_ID));

    expect(res.status).toBe(200);
    expect(res.body.following).toBe(true);
    expect(me.followedUsers).toEqual([STRANGER_ID]);
  });
});

describe("unknown routes", () => {
  it("return a JSON 404", async () => {
    const res = await request(app).get("/api/v1/nope");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
