import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_DIR } from "./init.js";

async function revertRepo(commitID) {
  const repoPath = path.resolve(process.cwd(), REPO_DIR);
  const commitsPath = path.join(repoPath, "commits");

  try {
    const commitDir = path.join(commitsPath, commitID);
    const files = await fs.readdir(commitDir).catch(() => {
      throw new Error(`No commit found with id ${commitID}`);
    });
    const parentDir = path.resolve(repoPath, "..");

    for (const file of files) {
      if (file === "commit.json") continue;
      await fs.copyFile(path.join(commitDir, file), path.join(parentDir, file));
    }

    console.log(`Reverted to commit ${commitID}.`);
  } catch (err) {
    console.error("Error reverting:", err.message);
  }
}

export { revertRepo };
