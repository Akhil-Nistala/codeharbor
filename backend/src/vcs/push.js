import { promises as fs } from "node:fs";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../config/s3.js";
import { REPO_DIR } from "./init.js";

async function pushRepo() {
  const repoPath = path.resolve(process.cwd(), REPO_DIR);
  const commitsPath = path.join(repoPath, "commits");

  try {
    const { s3, bucket } = getS3Client();
    const commitDirs = await fs.readdir(commitsPath);

    for (const commitDir of commitDirs) {
      const commitPath = path.join(commitsPath, commitDir);
      const files = await fs.readdir(commitPath);

      for (const file of files) {
        const fileContent = await fs.readFile(path.join(commitPath, file));
        await s3.send(
          new PutObjectCommand({ Bucket: bucket, Key: `commits/${commitDir}/${file}`, Body: fileContent })
        );
      }
    }

    console.log("All commits pushed.");
  } catch (err) {
    console.error("Error pushing:", err.message);
  }
}

export { pushRepo };
