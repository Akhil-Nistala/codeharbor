import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import withAuth from "../utils/withAuth";
import { apiClient } from "../context/AuthContext";
import "../styles/repo.css";

function RepositoryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = localStorage.getItem("userId");

  const [repository, setRepository] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [issues, setIssues] = useState([]);
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const loadRepository = async () => {
    try {
      const res = await apiClient.get(`/repos/${id}`);
      setRepository(res.data);
    } catch {
      setNotFound(true);
    }
  };

  const loadIssues = async () => {
    try {
      const res = await apiClient.get(`/repos/${id}/issues`);
      setIssues(res.data);
    } catch (err) {
      console.error("Error fetching issues:", err);
    }
  };

  useEffect(() => {
    loadRepository();
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isOwner = repository && repository.owner?._id === currentUser;

  const handleToggleVisibility = async () => {
    setBusy(true);
    try {
      await apiClient.patch(`/repos/${id}/visibility`);
      await loadRepository();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this repository? This can't be undone.")) return;
    setBusy(true);
    try {
      await apiClient.delete(`/repos/${id}`);
      navigate("/");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDescription.trim()) return;
    setBusy(true);
    try {
      await apiClient.post(`/repos/${id}/issues`, { title: issueTitle, description: issueDescription });
      setIssueTitle("");
      setIssueDescription("");
      await loadIssues();
    } finally {
      setBusy(false);
    }
  };

  const handleCloseIssue = async (issueId, status) => {
    await apiClient.put(`/issues/${issueId}`, { status: status === "open" ? "closed" : "open" });
    await loadIssues();
  };

  if (notFound) {
    return (
      <>
        <Navbar />
        <div className="create-repo-wrapper">
          <p>This repository doesn't exist, or is private.</p>
        </div>
      </>
    );
  }

  if (!repository) return null;

  return (
    <>
      <Navbar />
      <div className="repo-detail-wrapper">
        <div className="repo-detail-header">
          <h2>
            <Link to={`/profile/${repository.owner?._id}`}>{repository.owner?.username}</Link> /{" "}
            {repository.name}
            {!repository.visibility && <span className="badge">Private</span>}
          </h2>

          {isOwner && (
            <div className="repo-actions">
              <button onClick={handleToggleVisibility} disabled={busy}>
                Make {repository.visibility ? "private" : "public"}
              </button>
              <button onClick={handleDelete} disabled={busy} className="danger">
                Delete
              </button>
            </div>
          )}
        </div>

        <p className="muted">{repository.description || "No description provided."}</p>

        <h3>Files</h3>
        {repository.content?.length ? (
          <ul>
            {repository.content.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No content pushed yet.</p>
        )}

        <h3>Issues</h3>
        <form onSubmit={handleCreateIssue} className="issue-form">
          <input
            className="input"
            placeholder="Issue title"
            value={issueTitle}
            onChange={(e) => setIssueTitle(e.target.value)}
          />
          <textarea
            className="input textarea"
            placeholder="Describe the issue"
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
          />
          <button type="submit" className="submit-btn" disabled={busy}>
            Open issue
          </button>
        </form>

        {issues.length === 0 ? (
          <p className="muted">No issues yet.</p>
        ) : (
          <ul className="issue-list">
            {issues.map((issue) => (
              <li key={issue._id}>
                <div>
                  <strong>{issue.title}</strong>{" "}
                  <span className={`badge ${issue.status === "open" ? "open" : ""}`}>{issue.status}</span>
                  <p className="muted">{issue.description}</p>
                </div>
                <button onClick={() => handleCloseIssue(issue._id, issue.status)}>
                  Mark {issue.status === "open" ? "closed" : "open"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default withAuth(RepositoryDetail);
