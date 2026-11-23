// HTTP contract for signup/login. The model layer is mocked, so these run
// without a database.
import { mockModels, query, resetModels } from "./support/mockModels.js";

const models = mockModels();
const { User } = models;

const bcrypt = (await import("bcryptjs")).default;
const jwt = (await import("jsonwebtoken")).default;
const request = (await import("supertest")).default;
const { default: app } = await import("../src/app.js");

const USER_ID = "64b000000000000000000001";

beforeEach(() => resetModels(models));

describe("POST /api/v1/auth/signup", () => {
  it("creates the user, hashes the password and returns a token", async () => {
    User.create.mockResolvedValue({ _id: USER_ID });

    const res = await request(app)
      .post("/api/v1/auth/signup")
      .send({ username: "alice", email: "Alice@Example.com", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(USER_ID);
    expect(jwt.verify(res.body.token, "test-secret").id).toBe(USER_ID);

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

  it("returns a token for correct credentials", async () => {
    User.findOne.mockReturnValue(query(await storedUser()));

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(jwt.verify(res.body.token, "test-secret").id).toBe(USER_ID);
  });

  it("rejects a wrong password with 401", async () => {
    User.findOne.mockReturnValue(query(await storedUser()));

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "alice@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
  });

  it("gives an unknown email the same 401 as a wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ghost@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });
});
