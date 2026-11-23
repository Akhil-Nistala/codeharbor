import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    repositories: [{ type: Schema.Types.ObjectId, ref: "Repository", default: [] }],
    followedUsers: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    starRepos: [{ type: Schema.Types.ObjectId, ref: "Repository", default: [] }]
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
