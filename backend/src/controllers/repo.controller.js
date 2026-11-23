import { Repository } from "../models/repo.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Public repos are visible to everyone; private repos only to their owner.
const visibleTo = (userId) =>
  userId ? { $or: [{ visibility: true }, { owner: userId }] } : { visibility: true };

const createRepository = asyncHandler(async (req, res) => {
  const { name, description, visibility, content } = req.body;

  try {
    const repository = await Repository.create({
      name,
      description,
      visibility: visibility ?? true,
      content: content ?? [],
      owner: req.userId
    });

    res.status(201).json({ success: true, message: "Repository created", repositoryID: repository._id });
  } catch (err) {
    // The { owner, name } unique index is the source of truth, so two
    // concurrent creates can't both succeed.
    if (err.code === 11000) {
      throw new ApiError(409, "You already have a repository with that name");
    }
    throw err;
  }
});

const getAllRepositories = asyncHandler(async (req, res) => {
  const repositories = await Repository.find(visibleTo(req.userId))
    .populate("owner", "username")
    .sort({ createdAt: -1 });

  res.status(200).json(repositories);
});

const fetchRepositoryById = asyncHandler(async (req, res) => {
  const repository = await Repository.findOne({ _id: req.params.id, ...visibleTo(req.userId) })
    .populate("owner", "username")
    .populate("issues");

  // A private repo you don't own gets the same 404 as one that doesn't exist.
  if (!repository) {
    throw new ApiError(404, "Repository not found");
  }

  res.status(200).json(repository);
});

const fetchRepositoryByName = asyncHandler(async (req, res) => {
  const repositories = await Repository.find({ name: req.params.name, ...visibleTo(req.userId) })
    .populate("owner", "username")
    .populate("issues");

  res.status(200).json(repositories);
});

const fetchRepositoriesForUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const repositories = await Repository.find({
    owner: userId,
    ...(userId === req.userId ? {} : { visibility: true })
  }).sort({ createdAt: -1 });

  res.status(200).json({ repositories });
});

// req.repository is loaded and ownership-checked by requireRepoOwner.
const updateRepositoryById = asyncHandler(async (req, res) => {
  const { content, description } = req.body;
  const { repository } = req;

  if (content !== undefined) repository.content.push(content);
  if (description !== undefined) repository.description = description;

  const updated = await repository.save();
  res.status(200).json({ success: true, message: "Repository updated", repository: updated });
});

const toggleVisibilityById = asyncHandler(async (req, res) => {
  const { repository } = req;

  repository.visibility = !repository.visibility;
  const updated = await repository.save();
  res.status(200).json({ success: true, message: "Repository visibility toggled", repository: updated });
});

const deleteRepositoryById = asyncHandler(async (req, res) => {
  await req.repository.deleteOne();
  res.status(200).json({ success: true, message: "Repository deleted" });
});

export {
  createRepository,
  deleteRepositoryById,
  fetchRepositoriesForUser,
  fetchRepositoryById,
  fetchRepositoryByName,
  getAllRepositories,
  toggleVisibilityById,
  updateRepositoryById
};
