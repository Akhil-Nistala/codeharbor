import { promises as fs } from "node:fs";
import path from "node:path";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../config/s3.js";
import { REPO_DIR } from "./init.js";

async function pullRepo() {
  const repoPath = path.resolve(process.cwd(), REPO_DIR);

  try {
    const { s3, bucket } = getS3Client();
    const data = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "commits/" }));
    const objects = data.Contents || [];

    for (const object of objects) {
      const key = object.Key;
      const commitDir = path.join(repoPath, "commits", path.dirname(key).split("/").pop());
      await fs.mkdir(commitDir, { recursive: true });

      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await response.Body.transformToByteArray();
      await fs.writeFile(path.join(repoPath, key), Buffer.from(bytes));
    }

    console.log(`Pulled ${objects.length} file(s).`);
  } catch (err) {
    console.error("Error pulling:", err.message);
  }
}

export { pullRepo };
