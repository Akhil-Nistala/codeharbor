import mongoose, { Schema } from "mongoose";

const repositorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String },
    content: [{ type: String }],
    visibility: { type: Boolean, default: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    issues: [{ type: Schema.Types.ObjectId, ref: "Issue" }]
  },
  { timestamps: true }
);

// A repo name only needs to be unique per owner (like GitHub) — two
// different users can both have a repo named "notes".
repositorySchema.index({ owner: 1, name: 1 }, { unique: true });

export const Repository = mongoose.model("Repository", repositorySchema);
