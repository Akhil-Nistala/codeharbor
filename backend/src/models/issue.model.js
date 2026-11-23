import mongoose, { Schema } from "mongoose";

const issueSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    repository: { type: Schema.Types.ObjectId, ref: "Repository", required: true },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

export const Issue = mongoose.model("Issue", issueSchema);
