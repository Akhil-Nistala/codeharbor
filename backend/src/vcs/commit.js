const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { REPO_DIR } = require("./init");

async function commitRepo(message) {
  const repoPath = path.resolve(process.cwd(), REPO_DIR);
  const stagedPath = path.join(repoPath, "staging");
  const commitPath = path.join(repoPath, "commits");

  try {
    const commitID = uuidv4();
    const commitDir = path.join(commitPath, commitID);
    await fs.mkdir(commitDir, { recursive: true });

    const files = await fs.readdir(stagedPath).catch(() => []);
    if (files.length === 0) {
      console.log("Nothing staged to commit — use `add <file>` first.");
      return;
    }

    for (const file of files) {
      await fs.copyFile(path.join(stagedPath, file), path.join(commitDir, file));
    }

    await fs.writeFile(
      path.join(commitDir, "commit.json"),
      JSON.stringify({ message, date: new Date().toISOString() }, null, 2)
    );

    console.log(`Commit ${commitID} created: ${message}`);
  } catch (err) {
    console.error("Error committing files:", err.message);
  }
}

module.exports = { commitRepo };
