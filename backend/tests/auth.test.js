// HTTP contract for signup, login, logout and /me. The model layer is mocked, so these run
// without a database.
import { mockModels, query, resetModels } from "./support/mockModels.js";

const models = mockModels();
const { User } = models;

const bcrypt = (await import("bcryptjs")).default;
const jwt = (await import("jsonwebtoken")).default;
const request = (await import("supertest")).default;
const { default: app } = await import("../src/app.js");
const { signSessionToken } = await import("../src/utils/tokens.js");

const sessionCookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("token="));

// The JWT inside the Set-Cookie header.
const tokenFrom = (cookie) => decodeURIComponent(cookie.split(";")[0].split("=")[1]);

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
    const cookie = sessionCookieFrom(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(jwt.verify(tokenFrom(cookie), "test-secret").id).toBe(USER_ID);
    expect(res.body.token).toBeUndefined();

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

  it("sets the session JWT in an httpOnly cookie for correct credentials", async () => {
    User.findOne.mockReturnValue(query(await storedUser()));

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(USER_ID);
    // The token is only in the cookie, never in the body where JavaScript could read it.
    expect(res.body.token).toBeUndefined();

    const cookie = sessionCookieFrom(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const payload = jwt.verify(tokenFrom(cookie), "test-secret");
    expect(payload.id).toBe(USER_ID);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("rejects a wrong password with 401", async () => {
    User.findOne.mockReturnValue(query(await storedUser()));

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(sessionCookieFrom(res)).toBeUndefined();
  });

  it("gives an unknown email the same 401 as a wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ghost@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await request(app).post("/api/v1/auth/logout");

    expect(res.status).toBe(200);
    expect(sessionCookieFrom(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the logged-in user from the cookie", async () => {
    User.findById.mockReturnValue(query({ _id: USER_ID, username: "alice" }));

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `token=${signSessionToken({ _id: USER_ID })}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: USER_ID, username: "alice" });
  });

  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a tampered cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", "token=not.a.jwt");
    expect(res.status).toBe(401);
  });
});
