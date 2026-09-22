import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../Navbar";
import withAuth from "../../utils/withAuth";
import { apiClient } from "../../context/AuthContext";
import "./dashboard.css";

function Dashboard() {
  const [repositories, setRepositories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestedRepositories, setSuggestedRepositories] = useState([]);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const userId = localStorage.getItem("userId");

    const fetchRepositories = async () => {
      try {
        const response = await apiClient.get(`/repo/user/${userId}`);
        setRepositories(response.data.repositories ?? []);
      } catch (err) {
        console.error("Error fetching repositories:", err);
      }
    };

    const fetchSuggestedRepositories = async () => {
      try {
        const response = await apiClient.get(`/repo/all`);
        setSuggestedRepositories(response.data ?? []);
      } catch (err) {
        console.error("Error fetching repositories:", err);
      }
    };

    fetchRepositories();
    fetchSuggestedRepositories();
  }, []);

  useEffect(() => {
    if (searchQuery === "") {
      setSearchResults(repositories);
    } else {
      setSearchResults(
        repositories.filter((repo) => repo.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
  }, [searchQuery, repositories]);

  return (
    <>
      <Navbar />
      <section id="dashboard">
        <aside>
          <h3>Suggested Repositories</h3>
          {suggestedRepositories.length === 0 && <p className="muted">Nothing here yet.</p>}
          {suggestedRepositories.map((repo) => (
            <Link className="repo-link" to={`/repo/${repo._id}`} key={repo._id}>
              <h4>{repo.name}</h4>
              <p className="muted">{repo.description}</p>
            </Link>
          ))}
        </aside>
        <main>
          <h2>Your Repositories</h2>
          <div id="search">
            <input
              type="text"
              value={searchQuery}
              placeholder="Search..."
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchResults.length === 0 && <p className="muted">No repositories yet — create one to get started.</p>}
          {searchResults.map((repo) => (
            <Link className="repo-link" to={`/repo/${repo._id}`} key={repo._id}>
              <h4>
                {repo.name} {!repo.visibility && <span className="badge">Private</span>}
              </h4>
              <p className="muted">{repo.description}</p>
            </Link>
          ))}
        </main>
      </section>
    </>
  );
}

export default withAuth(Dashboard);
