const mongoose = require("mongoose");
const Issue = require("../models/issue.model");
const Repository = require("../models/repo.model");

async function createIssue(req, res) {
  const { title, description } = req.body;
  const { id } = req.params; // repository id

  if (!title || !description) {
    return res.status(400).json({ error: "title and description are required" });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid repository id" });
  }

  try {
    const repository = await Repository.findById(id);
    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    const issue = await Issue.create({ title, description, repository: id, author: req.userId });
    repository.issues.push(issue._id);
    await repository.save();

    res.status(201).json(issue);
  } catch (err) {
    console.error("Error creating issue:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function canModifyIssue(issue, userId) {
  if (issue.author.toString() === userId) return true;
  const repository = await Repository.findById(issue.repository);
  return !!repository && repository.owner.toString() === userId;
}

async function updateIssueById(req, res) {
  const { id } = req.params;
  const { title, description, status } = req.body;

  try {
    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }
    if (!(await canModifyIssue(issue, req.userId))) {
      return res.status(403).json({ error: "Only the issue author or repository owner can do that" });
    }

    if (title !== undefined) issue.title = title;
    if (description !== undefined) issue.description = description;
    if (status !== undefined) issue.status = status;

    await issue.save();
    res.json({ message: "Issue updated", issue });
  } catch (err) {
    console.error("Error updating issue:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteIssueById(req, res) {
  const { id } = req.params;

  try {
    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }
    if (!(await canModifyIssue(issue, req.userId))) {
      return res.status(403).json({ error: "Only the issue author or repository owner can do that" });
    }

    await issue.deleteOne();
    await Repository.updateOne({ _id: issue.repository }, { $pull: { issues: issue._id } });

    res.json({ message: "Issue deleted" });
  } catch (err) {
    console.error("Error deleting issue:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getAllIssues(req, res) {
  const { id } = req.params;

  try {
    const issues = await Issue.find({ repository: id }).sort({ createdAt: -1 });
    res.status(200).json(issues);
  } catch (err) {
    console.error("Error fetching issues:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getIssueById(req, res) {
  const { id } = req.params;

  try {
    const issue = await Issue.findById(id);
    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }

    res.json(issue);
  } catch (err) {
    console.error("Error fetching issue:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = { createIssue, updateIssueById, deleteIssueById, getAllIssues, getIssueById };
