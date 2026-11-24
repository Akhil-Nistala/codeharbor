import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import apiClient from "../api/client";
import { useAuth } from "../context/useAuth";
import "../styles/dashboard.css";

function Dashboard() {
  const { currentUser } = useAuth();
  const [repositories, setRepositories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestedRepositories, setSuggestedRepositories] = useState([]);

  useEffect(() => {
    const fetchRepositories = async () => {
      try {
        const response = await apiClient.get(`/repos/user/${currentUser}`);
        setRepositories(response.data.repositories ?? []);
      } catch (err) {
        console.error("Error fetching repositories:", err);
      }
    };

    const fetchSuggestedRepositories = async () => {
      try {
        const response = await apiClient.get("/repos");
        setSuggestedRepositories(response.data ?? []);
      } catch (err) {
        console.error("Error fetching repositories:", err);
      }
    };

    fetchRepositories();
    fetchSuggestedRepositories();
  }, [currentUser]);

  const searchResults = searchQuery
    ? repositories.filter((repo) => repo.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : repositories;

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

export default Dashboard;
