import { S3Client } from "@aws-sdk/client-s3";

// Lazy on purpose: the web API doesn't need AWS at all, only the `push`/`pull`
// CLI commands do. Constructing the client eagerly would make every server
// boot depend on AWS credentials being present.
export const getS3Client = () => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not set. Copy .env.example to .env and fill it in to use push/pull.");
  }

  const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-south-1" });
  return { s3, bucket };
};
