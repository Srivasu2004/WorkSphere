
"use client";

import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#f5f7fb",
      padding: "30px",
      fontFamily: "Arial, sans-serif"
    }}>
      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "#ffffff",
        padding: "20px",
        borderRadius: "12px"
      }}>
        <div>
          <h1 style={{ color: "#17243a" }}>WorkSphere</h1>
          <p>Project Management Dashboard</p>
        </div>

        <button
          onClick={handleLogout}
          style={{
            background: "#dc3545",
            color: "white",
            border: "none",
            padding: "12px 20px",
            borderRadius: "6px",
            cursor: "pointer"
          }}
        >
          Logout
        </button>
      </header>

      <section style={{
        marginTop: "30px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "20px"
      }}>
        {[
          ["Projects", "Manage your projects"],
          ["Tasks", "Track your daily tasks"],
          ["Team Members", "Manage your team"],
          ["Reports", "View project reports"]
        ].map(([title, description]) => (
          <div key={title} style={{
            background: "white",
            padding: "25px",
            borderRadius: "12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
          }}>
            <h2>{title}</h2>
            <p style={{ marginTop: "10px", color: "#64748b" }}>
              {description}
            </p>
          </div>
        ))}
      </section>

      <section style={{
        background: "white",
        marginTop: "25px",
        padding: "25px",
        borderRadius: "12px"
      }}>
        <h2>Welcome to WorkSphere!</h2>
        <p style={{ marginTop: "12px" }}>
          Your project management workspace is ready.
          Start organizing your projects and tasks.
        </p>
      </section>
    </main>
  );
}
