
import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { pool, withTenant } from "./db";
import { requireAuth, allowRoles, signToken } from "./auth";

// ==========================================
// CONFIGURATION
// ==========================================

const app = express();
const PORT = Number(process.env.API_PORT || 4000);

console.log("Database environment test:", {
  passwordLoaded: Boolean(process.env.DB_PASSWORD),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
});

if (
  !process.env.DB_PASSWORD ||
  !process.env.DB_NAME ||
  !process.env.DB_USER
) {
  throw new Error(
    "Missing PostgreSQL environment variables. Check api/.env"
  );
}

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(helmet());

app.use(
  cors({
    origin: (
      process.env.FRONTEND_ORIGIN || "http://localhost:3000"
    ).split(","),
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      status: "ok",
      service: "worksphere-api",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check error:", error);

    res.status(503).json({
      success: false,
      status: "unavailable",
    });
  }
});
app.get("/api/test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        return res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      success: true,
      message: "WorkSphere API and PostgreSQL connected",
    });
  } catch (error) {
    console.error("Database health check:", error);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// ==========================================
// AUTHENTICATION - REGISTER
// ==========================================

const registerSchema = z.object({
  organizationName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(100),
});

app.post("/api/auth/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid registration data",
      details: parsed.error.flatten(),
    });
  }

  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    const tenantResult = await client.query(
      `INSERT INTO tenants(name)
       VALUES($1)
       RETURNING id, name`,
      [parsed.data.organizationName]
    );

    const tenant = tenantResult.rows[0];

    const hashedPassword = await bcrypt.hash(
      parsed.data.password,
      12
    );

    const userResult = await client.query(
      `INSERT INTO users
       (tenant_id, name, email, password_hash, role)
       VALUES($1, $2, lower($3), $4, 'organization_owner')
       RETURNING id, name, email, role, tenant_id`,
      [
        tenant.id,
        parsed.data.name,
        parsed.data.email,
        hashedPassword,
      ]
    );

    const user = userResult.rows[0];

    await client.query("COMMIT");

    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user,
      tenant,
    });
  } catch (error: any) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Registration error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Email already registered",
      });
    }

    return next(error);
  } finally {
    client?.release();
  }
});

// ==========================================
// AUTHENTICATION - LOGIN
// ==========================================

app.post("/api/auth/login", async (req, res, next) => {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(1),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Email and password are required",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, tenant_id, name, email, password_hash, role
       FROM users
       WHERE email = lower($1)
       ORDER BY created_at
       LIMIT 1`,
      [parsed.data.email]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        parsed.data.password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    delete user.password_hash;

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// CURRENT AUTHENTICATED USER
// ==========================================

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
});

// ==========================================
// PROJECTS
// ==========================================

const projectSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(5000).optional(),
  dueDate: z.string().date().optional(),
});

// GET PROJECTS

app.get("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await withTenant(tenantId, (client) =>
      client.query(
        `SELECT p.*, COUNT(t.id)::int AS task_count
         FROM projects p
         LEFT JOIN tasks t
           ON t.project_id = p.id
           AND t.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [tenantId]
      )
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// CREATE PROJECT

app.post(
  "/api/projects",
  requireAuth,
  allowRoles(
    "organization_owner",
    "project_manager",
    "platform_admin"
  ),
  async (req, res, next) => {
    const parsed = projectSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid project",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;

      const row = await withTenant(tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO projects
           (tenant_id, name, description, owner_id, due_date)
           VALUES($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            tenantId,
            parsed.data.name,
            parsed.data.description || "",
            req.user!.userId,
            parsed.data.dueDate || null,
          ]
        );

        const project = result.rows[0];

        await client.query(
          `INSERT INTO activity_events
           (tenant_id, actor_id, entity_type, entity_id, action)
           VALUES($1, $2, 'project', $3, 'created')`,
          [tenantId, req.user!.userId, project.id]
        );

        await client.query(
          `INSERT INTO audit_logs
           (tenant_id, actor_id, action, entity_type, entity_id)
           VALUES($1, $2, 'project.created', 'project', $3)`,
          [tenantId, req.user!.userId, project.id]
        );

        return project;
      });

      res.status(201).json(row);
    } catch (error) {
      next(error);
    }
  }
);

// UPDATE PROJECT

app.patch(
  "/api/projects/:id",
  requireAuth,
  allowRoles(
    "organization_owner",
    "project_manager",
    "platform_admin"
  ),
  async (req, res, next) => {
    const parsed = z
      .object({
        name: z.string().min(2).max(180).optional(),
        description: z.string().max(5000).optional(),
        status: z
          .enum(["active", "on_hold", "completed", "archived"])
          .optional(),
        dueDate: z.string().date().nullable().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid project update",
      });
    }

    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(tenantId, (client) =>
        client.query(
          `UPDATE projects
           SET name = COALESCE($3, name),
               description = COALESCE($4, description),
               status = COALESCE($5, status),
               due_date = CASE
                 WHEN $6::boolean THEN $7::date
                 ELSE due_date
               END,
               updated_at = now()
           WHERE id = $1 AND tenant_id = $2
           RETURNING *`,
          [
            req.params.id,
            tenantId,
            parsed.data.name ?? null,
            parsed.data.description ?? null,
            parsed.data.status ?? null,
            parsed.data.dueDate !== undefined,
            parsed.data.dueDate ?? null,
          ]
        )
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// PROJECT TASKS
// ==========================================

// GET TASKS

app.get(
  "/api/projects/:projectId/tasks",
  requireAuth,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(tenantId, (client) =>
        client.query(
          `SELECT *
           FROM tasks
           WHERE tenant_id = $1 AND project_id = $2
           ORDER BY created_at DESC`,
          [tenantId, req.params.projectId]
        )
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// CREATE TASK

app.post(
  "/api/projects/:projectId/tasks",
  requireAuth,
  async (req, res, next) => {
    const parsed = z
      .object({
        title: z.string().min(2).max(240),
        description: z.string().max(5000).optional(),
        priority: z
          .enum(["low", "medium", "high", "urgent"])
          .optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        dueDate: z.string().date().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid task",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;

      const row = await withTenant(tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO tasks
           (tenant_id, project_id, title, description,
            priority, assignee_id, due_date)
           SELECT $1, id, $3, $4, $5, $6, $7
           FROM projects
           WHERE id = $2 AND tenant_id = $1
           RETURNING *`,
          [
            tenantId,
            req.params.projectId,
            parsed.data.title,
            parsed.data.description || "",
            parsed.data.priority || "medium",
            parsed.data.assigneeId || null,
            parsed.data.dueDate || null,
          ]
        );

        if (result.rowCount) {
          await client.query(
            `INSERT INTO activity_events
             (tenant_id, actor_id, entity_type, entity_id, action)
             VALUES($1, $2, 'task', $3, 'created')`,
            [tenantId, req.user!.userId, result.rows[0].id]
          );
        }

        return result.rows[0];
      });

      if (!row) {
        return res.status(404).json({
          error: "Project not found",
        });
      }

      res.status(201).json(row);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// UPDATE TASK
// ==========================================

app.patch("/api/tasks/:id", requireAuth, async (req, res, next) => {
  const parsed = z
    .object({
      title: z.string().min(2).max(240).optional(),
      status: z
        .enum(["todo", "in_progress", "blocked", "done"])
        .optional(),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional(),
      assigneeId: z.string().uuid().nullable().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid task update",
    });
  }

  try {
    const tenantId = req.user!.tenantId;

    const result = await withTenant(tenantId, (client) =>
      client.query(
        `UPDATE tasks
         SET title = COALESCE($3, title),
             status = COALESCE($4, status),
             priority = COALESCE($5, priority),
             assignee_id = COALESCE($6, assignee_id),
             updated_at = now()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        [
          req.params.id,
          tenantId,
          parsed.data.title ?? null,
          parsed.data.status ?? null,
          parsed.data.priority ?? null,
          parsed.data.assigneeId ?? null,
        ]
      )
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        error: "Task not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// TASK COMMENTS
// ==========================================

app.post(
  "/api/tasks/:id/comments",
  requireAuth,
  async (req, res, next) => {
    const parsed = z
      .object({
        body: z.string().min(1).max(5000),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid comment",
      });
    }

    try {
      const tenantId = req.user!.tenantId;

      const row = await withTenant(tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO comments
           (tenant_id, task_id, author_id, body)
           SELECT $1, t.id, $3, $4
           FROM tasks t
           WHERE t.id = $2 AND t.tenant_id = $1
           RETURNING *`,
          [
            tenantId,
            req.params.id,
            req.user!.userId,
            parsed.data.body,
          ]
        );

        return result.rows[0];
      });

      if (!row) {
        return res.status(404).json({
          error: "Task not found",
        });
      }

      res.status(201).json(row);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// ACTIVITY
// ==========================================

app.get("/api/activity", requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const result = await withTenant(tenantId, (client) =>
      client.query(
        `SELECT *
         FROM activity_events
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [tenantId]
      )
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// AUDIT LOGS
// ==========================================

app.get(
  "/api/audit",
  requireAuth,
  allowRoles("organization_owner", "auditor", "platform_admin"),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(tenantId, (client) =>
        client.query(
          `SELECT *
           FROM audit_logs
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT 200`,
          [tenantId]
        )
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("WorkSphere API Error:", error);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
);

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("PostgreSQL connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log("----------------------------------");
      console.log("WorkSphere API running");
      console.log(`Port: ${PORT}`);
      console.log(`URL: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log("----------------------------------");
    });
  } catch (error) {
    console.error("DATABASE CONNECTION ERROR:", error);
    process.exit(1);
  }
}

startServer();
