const fs = require("fs").promises;
const path = require("path");

const REPO_DIR = ".codeharbor";

async function initRepo() {
  const repoPath = path.resolve(process.cwd(), REPO_DIR);
  const commitsPath = path.join(repoPath, "commits");

  try {
    await fs.mkdir(repoPath, { recursive: true });
    await fs.mkdir(commitsPath, { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "config.json"),
      JSON.stringify({ bucket: process.env.S3_BUCKET || null }, null, 2)
    );
    console.log(`Repository initialised in ${REPO_DIR}/`);
  } catch (err) {
    console.error("Error initialising repository:", err.message);
  }
}

module.exports = { initRepo, REPO_DIR };
