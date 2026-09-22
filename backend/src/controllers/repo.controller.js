const mongoose = require("mongoose");
const Repository = require("../models/repo.model");

function visibleTo(userId) {
  // Public repos are visible to everyone; private repos only to their owner.
  return userId ? { $or: [{ visibility: true }, { owner: userId }] } : { visibility: true };
}

async function createRepository(req, res) {
  const { name, description, visibility, content } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Repository name is required" });
  }

  try {
    const repository = await Repository.create({
      name,
      description,
      visibility: visibility ?? true,
      content: content ?? [],
      owner: req.userId
    });

    res.status(201).json({ message: "Repository created", repositoryID: repository._id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "You already have a repository with that name" });
    }
    console.error("Error creating repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getAllRepositories(req, res) {
  try {
    const repositories = await Repository.find(visibleTo(req.userId))
      .populate("owner", "username")
      .sort({ createdAt: -1 });

    res.json(repositories);
  } catch (err) {
    console.error("Error fetching repositories:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function fetchRepositoryById(req, res) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid repository id" });
  }

  try {
    const repository = await Repository.findOne({ _id: id, ...visibleTo(req.userId) })
      .populate("owner", "username")
      .populate("issues");

    if (!repository) {
      return res.status(404).json({ error: "Repository not found" });
    }

    res.json(repository);
  } catch (err) {
    console.error("Error fetching repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function fetchRepositoryByName(req, res) {
  const { name } = req.params;

  try {
    const repositories = await Repository.find({ name, ...visibleTo(req.userId) })
      .populate("owner", "username")
      .populate("issues");

    res.json(repositories);
  } catch (err) {
    console.error("Error fetching repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function fetchRepositoriesForCurrentUser(req, res) {
  const { userID } = req.params;

  try {
    const repositories = await Repository.find({
      owner: userID,
      ...(userID === req.userId ? {} : { visibility: true })
    }).sort({ createdAt: -1 });

    res.json({ repositories });
  } catch (err) {
    console.error("Error fetching user repositories:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function updateRepositoryById(req, res) {
  const { content, description } = req.body;
  const repository = req.repository; // set by requireRepoOwner

  try {
    if (content !== undefined) repository.content.push(content);
    if (description !== undefined) repository.description = description;

    const updated = await repository.save();
    res.json({ message: "Repository updated", repository: updated });
  } catch (err) {
    console.error("Error updating repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function toggleVisibilityById(req, res) {
  const repository = req.repository;

  try {
    repository.visibility = !repository.visibility;
    const updated = await repository.save();
    res.json({ message: "Repository visibility toggled", repository: updated });
  } catch (err) {
    console.error("Error toggling visibility:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteRepositoryById(req, res) {
  try {
    await req.repository.deleteOne();
    res.json({ message: "Repository deleted" });
  } catch (err) {
    console.error("Error deleting repository:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  createRepository,
  getAllRepositories,
  fetchRepositoryById,
  fetchRepositoryByName,
  fetchRepositoriesForCurrentUser,
  updateRepositoryById,
  toggleVisibilityById,
  deleteRepositoryById
};
