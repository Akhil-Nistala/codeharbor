// HTTP contract for signup, login, refresh and logout. The model layer is mocked, so these run
// without a database.
import { mockModels, query, resetModels } from "./support/mockModels.js";

const models = mockModels();
const { User, RefreshToken } = models;

const bcrypt = (await import("bcryptjs")).default;
const jwt = (await import("jsonwebtoken")).default;
const request = (await import("supertest")).default;
const { default: app } = await import("../src/app.js");
const { hashToken } = await import("../src/utils/tokens.js");

const refreshCookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("refreshToken="));

const USER_ID = "64b000000000000000000001";

beforeEach(() => resetModels(models));

describe("POST /api/v1/auth/signup", () => {
  it("creates the user, hashes the password and starts a session", async () => {
    User.create.mockResolvedValue({ _id: USER_ID });

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: "alice", email: "Alice@Example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(USER_ID);
    expect(jwt.verify(res.body.token, "test-secret").id).toBe(USER_ID);
    expect(refreshCookieFrom(res)).toMatch(/HttpOnly/);

    const saved = User.create.mock.calls[0][0];
    expect(saved.email).toBe("alice@example.com");
    expect(saved.password).not.toBe("password123");
    expect(await bcrypt.compare("password123", saved.password)).toBe(true);
  });

  it("rejects a taken username or email with 409", async () => {
    User.findOne.mockReturnValue(query({ _id: USER_ID }));

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: "alice", email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(User.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input before it reaches the database", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: "al", email: "not-an-email", password: "123" });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(["email", "password", "username"]);
    expect(User.findOne).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/login", () => {
  const storedUser = async () => ({ _id: USER_ID, password: await bcrypt.hash("password123", 10) });

  it("returns an access token and an httpOnly refresh cookie for correct credentials", async () => {
    User.findOne.mockReturnValue(query(await storedUser()));

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.token, "test-secret");
    expect(payload.id).toBe(USER_ID);
    expect(payload.exp - payload.iat).toBe(15 * 60);

    const cookie = refreshCookieFrom(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

    // Only the hash of the refresh token is stored.
    const rawToken = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
    const saved = RefreshToken.create.mock.calls[0][0];
    expect(saved.tokenHash).toBe(hashToken(rawToken));
    expect(saved.tokenHash).not.toBe(rawToken);
  });

  it("rejects a wrong password with 401", async () => {
    User.findOne.mockReturnValue(query(await storedUser()));

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(refreshCookieFrom(res)).toBeUndefined();
  });

  it("gives an unknown email the same 401 as a wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ghost@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  const activeToken = (overrides = {}) => ({
    _id: "rt1",
    user: USER_ID,
    family: "fam1",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides
  });

  const refreshWith = (token) =>
    request(app).post("/api/v1/auth/refresh").set("Cookie", `refreshToken=${token}`);

  it("rotates a valid refresh token and returns a new access token", async () => {
    RefreshToken.findOne.mockReturnValue(query(activeToken()));
    RefreshToken.findOneAndUpdate.mockReturnValue(query(activeToken()));
    User.findById.mockReturnValue(query({ _id: USER_ID }));

    const res = await refreshWith("old-token");

    expect(res.status).toBe(200);
    expect(jwt.verify(res.body.token, "test-secret").id).toBe(USER_ID);
    expect(RefreshToken.findOne).toHaveBeenCalledWith({ tokenHash: hashToken("old-token") });

    // The old token is revoked and a new one is issued in the same family.
    expect(RefreshToken.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "rt1", revokedAt: null },
      { revokedAt: expect.any(Date) }
    );
    expect(RefreshToken.create.mock.calls[0][0].family).toBe("fam1");
    expect(refreshCookieFrom(res)).not.toMatch(/refreshToken=old-token/);
  });

  it("rejects a request without a refresh cookie", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await refreshWith("made-up");
    expect(res.status).toBe(401);
  });

  it("rejects an expired refresh token", async () => {
    RefreshToken.findOne.mockReturnValue(query(activeToken({ expiresAt: new Date(Date.now() - 1000) })));

    const res = await refreshWith("old-token");

    expect(res.status).toBe(401);
    expect(RefreshToken.create).not.toHaveBeenCalled();
  });

  it("revokes the whole family when an already-used token is presented again", async () => {
    RefreshToken.findOne.mockReturnValue(query(activeToken({ revokedAt: new Date() })));

    const res = await refreshWith("stolen-token");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Refresh token reuse detected");
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { family: "fam1", revokedAt: null },
      { revokedAt: expect.any(Date) }
    );
    expect(RefreshToken.create).not.toHaveBeenCalled();
  });

  it("issues only one new token when two refreshes race with the same token", async () => {
    RefreshToken.findOne.mockReturnValue(query(activeToken()));
    User.findById.mockReturnValue(query({ _id: USER_ID }));
    // The other request already claimed it.
    RefreshToken.findOneAndUpdate.mockReturnValue(query(null));

    const res = await refreshWith("old-token");

    expect(res.status).toBe(401);
    expect(RefreshToken.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the session's token family and clears the cookie", async () => {
    RefreshToken.findOne.mockReturnValue(query({ _id: "rt1", family: "fam1" }));

    const res = await request(app).post("/api/v1/auth/logout").set("Cookie", "refreshToken=some-token");

    expect(res.status).toBe(200);
    expect(RefreshToken.updateMany).toHaveBeenCalledWith(
      { family: "fam1", revokedAt: null },
      { revokedAt: expect.any(Date) }
    );
    expect(refreshCookieFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("still succeeds without a cookie", async () => {
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(200);
  });
});
