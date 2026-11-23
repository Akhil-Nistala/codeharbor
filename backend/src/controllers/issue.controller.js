import { Issue } from "../models/issue.model.js";
import { Repository } from "../models/repo.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// The issue's author or the owner of its repository may edit/delete it.
const canModifyIssue = async (issue, userId) => {
  if (issue.author.toString() === userId) return true;
  const repository = await Repository.findById(issue.repository);
  return !!repository && repository.owner.toString() === userId;
};

const loadModifiableIssue = async (req) => {
  const issue = await Issue.findById(req.params.id);
  if (!issue) {
    throw new ApiError(404, "Issue not found");
  }
  if (!(await canModifyIssue(issue, req.userId))) {
    throw new ApiError(403, "Only the issue author or repository owner can do that");
  }
  return issue;
};

// :id is the repository id.
const createIssue = asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  const { id } = req.params;

  const repository = await Repository.findById(id);
  if (!repository) {
    throw new ApiError(404, "Repository not found");
  }

  const issue = await Issue.create({ title, description, repository: id, author: req.userId });
  repository.issues.push(issue._id);
  await repository.save();

  res.status(201).json(issue);
});

// :id is the repository id.
const getAllIssues = asyncHandler(async (req, res) => {
  const issues = await Issue.find({ repository: req.params.id }).sort({ createdAt: -1 });
  res.status(200).json(issues);
});

const getIssueById = asyncHandler(async (req, res) => {
  const issue = await Issue.findById(req.params.id);
  if (!issue) {
    throw new ApiError(404, "Issue not found");
  }

  res.status(200).json(issue);
});

const updateIssueById = asyncHandler(async (req, res) => {
  const issue = await loadModifiableIssue(req);
  const { title, description, status } = req.body;

  if (title !== undefined) issue.title = title;
  if (description !== undefined) issue.description = description;
  if (status !== undefined) issue.status = status;

  await issue.save();
  res.status(200).json({ success: true, message: "Issue updated", issue });
});

const deleteIssueById = asyncHandler(async (req, res) => {
  const issue = await loadModifiableIssue(req);

  await issue.deleteOne();
  await Repository.updateOne({ _id: issue.repository }, { $pull: { issues: issue._id } });

  res.status(200).json({ success: true, message: "Issue deleted" });
});

export { createIssue, deleteIssueById, getAllIssues, getIssueById, updateIssueById };
