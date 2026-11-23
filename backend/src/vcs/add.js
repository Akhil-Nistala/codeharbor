import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_DIR } from "./init.js";

async function addRepo(filePath) {
  const repoPath = path.resolve(process.cwd(), REPO_DIR);
  const stagingPath = path.join(repoPath, "staging");

  try {
    await fs.mkdir(stagingPath, { recursive: true });
    const fileName = path.basename(filePath);
    await fs.copyFile(filePath, path.join(stagingPath, fileName));
    console.log(`File ${fileName} added to the staging area.`);
  } catch (err) {
    console.error("Error adding file:", err.message);
  }
}

export { addRepo };
