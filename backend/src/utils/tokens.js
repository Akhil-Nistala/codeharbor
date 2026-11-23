import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_TTL = "7d";

export const signAccessToken = (user) =>
  jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

export const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

export const bearerToken = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
};
