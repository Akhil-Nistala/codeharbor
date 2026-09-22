const mongoose = require("mongoose");

async function connectDB(uri) {
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
  }

  const connection = await mongoose.connect(uri);
  return connection.connection.host;
}

module.exports = { connectDB };
