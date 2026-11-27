
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  task_count: number;
};

type AuthResponse = {
  token: string;
  user: {
    name: string;
    email: string;
    role: string;
  };
};

export default function Home() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [userName, setUserName] = useState("Workspace");

  async function request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || data.message || "Request failed"
      );
    }

    return data as T;
  }

  async function loadProjects(currentToken = token) {
    const response = await fetch(`${API}/api/projects`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not load projects");
    }

    setProjects(data);
  }

  useEffect(() => {
    const saved = localStorage.getItem("worksphere_token");

    if (saved) {
      setToken(saved);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadProjects(token).catch((e) => setError(e.message));
    }
  }, [token]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const data = await request<AuthResponse>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }
      );

      if (!data.token || !data.user) {
        throw new Error("Invalid login response from server");
      }

      localStorage.setItem("worksphere_token", data.token);
      setUserName(data.user.name);
      setToken(data.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createProject(e: FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await request<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName }),
      });

      setProjectName("");
      await loadProjects();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function logout() {
    localStorage.removeItem("worksphere_token");
    setToken("");
    setProjects([]);
    setPassword("");
    setUserName("Workspace");
  }

  if (!token) {
    return (
      <main className="login">
        <section className="panel">
          <div className="logo">W</div>

          <p className="eyebrow">
            PROJECTS · PEOPLE · PROGRESS
          </p>

          <h1>Welcome to WorkSphere</h1>

          <p className="muted">
            Sign in to manage your organization's projects and teams.
          </p>

          <form onSubmit={login}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
              />
            </label>

            <button disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          <small>
            First time?{" "}
            <Link href="/register">
              Create an account
            </Link>
          </small>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo small">W</span>
          <b>WorkSphere</b>
        </div>

        <p className="eyebrow">WORKSPACE</p>

        <nav>
          <a className="active">▦　Overview</a>
          <a>▤　Projects</a>
          <a>☑　My tasks</a>
          <a>◷　Activity</a>
          <a>▥　Analytics</a>
          <a>⚙　Settings</a>
        </nav>

        <button className="secondary" onClick={logout}>
          Sign out
        </button>
      </aside>

      <section className="main">
        <header>
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Hello, {userName} 👋</h1>
            <p className="muted">
              Here's an overview of work across your organization.
            </p>
          </div>

          <div className="avatar">
            {userName.slice(0, 1).toUpperCase()}
          </div>
        </header>

        {error && <p className="error">{error}</p>}

        <div className="stats">
          <article>
            <span>Total projects</span>
            <strong>{projects.length}</strong>
            <small>Across your organization</small>
          </article>

          <article>
            <span>Active projects</span>
            <strong>
              {projects.filter((p) => p.status === "active").length}
            </strong>
            <small>Currently in progress</small>
          </article>

          <article>
            <span>Completed</span>
            <strong>
              {projects.filter((p) => p.status === "completed").length}
            </strong>
            <small>Successfully delivered</small>
          </article>
        </div>

        <section className="section">
          <div className="sectionHead">
            <div>
              <h2>Projects</h2>
              <p className="muted">
                Create and track your team's work.
              </p>
            </div>

            <form className="create" onSubmit={createProject}>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
                required
              />

              <button>Create project</button>
            </form>
          </div>

          <div className="grid">
            {projects.map((p) => (
              <article className="project" key={p.id}>
                <div className="projectTop">
                  <span className="statusDot" />
                  <span className="tag">
                    {p.status.replace("_", " ")}
                  </span>
                </div>

                <h3>{p.name}</h3>

                <p>
                  {p.description || "No description added yet."}
                </p>

                <footer>
                  <span>{p.task_count || 0} tasks</span>
                  <span>{p.id.slice(0, 8)}</span>
                </footer>
              </article>
            ))}

            {!projects.length && (
              <div className="empty">
                No projects yet. Create your first project above.
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
