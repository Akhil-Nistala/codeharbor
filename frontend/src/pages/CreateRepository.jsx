import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import apiClient from "../api/client";
import errorMessage from "../utils/errorMessage";
import "../styles/repo.css";

function CreateRepository() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiClient.post("/repos", { name, description, visibility });
      navigate(`/repo/${res.data.repositoryID}`);
    } catch (err) {
      setError(errorMessage(err, "Could not create repository"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="create-repo-wrapper">
        <h2>Create a new repository</h2>
        <form onSubmit={onSubmit} className="create-repo-form">
          <label className="label">Repository name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />

          <label className="label">Description</label>
          <textarea
            className="input textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={visibility}
              onChange={(e) => setVisibility(e.target.checked)}
            />
            Public repository
          </label>

          {error && <p style={{ color: "#f85149" }}>{error}</p>}

          <button type="submit" className="submit-btn" disabled={loading || !name}>
            {loading ? "Creating..." : "Create repository"}
          </button>
        </form>
      </div>
    </>
  );
}

export default CreateRepository;
