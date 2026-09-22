const express = require("express");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", routes);

app.use((req, res) => res.status(404).json({ message: "Not found" }));

module.exports = app;
