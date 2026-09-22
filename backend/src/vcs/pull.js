const fs = require("fs").promises;
const path = require("path");
const { ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getS3Client } = require("../config/s3");
const { REPO_DIR } = require("./init");

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

module.exports = { pullRepo };
