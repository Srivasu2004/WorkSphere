
import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { PoolClient } from "pg";

import { pool, withTenant } from "./db";

import {
  requireAuth,
  allowRoles,
  signToken,
} from "./auth";

// =====================================================
// 1. APPLICATION CONFIGURATION
// =====================================================

const app = express();

const PORT = Number(process.env.API_PORT || 4000);

const FRONTEND_ORIGINS = (
  process.env.FRONTEND_ORIGIN || "http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// =====================================================
// 2. ENVIRONMENT VALIDATION
// =====================================================

if (
  !process.env.DB_PASSWORD ||
  !process.env.DB_NAME ||
  !process.env.DB_USER
) {
  throw new Error(
    "Missing PostgreSQL environment variables. Check api/.env"
  );
}

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error(
    "JWT_SECRET must be at least 32 characters"
  );
}

console.log("WorkSphere Database Configuration:", {
  passwordLoaded: Boolean(process.env.DB_PASSWORD),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
});

// =====================================================
// 3. MIDDLEWARE
// =====================================================

app.use(helmet());

app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// =====================================================
// 4. HEALTH CHECK
// =====================================================

const healthCheck = async (
  _req: express.Request,
  res: express.Response
) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      success: true,
      status: "ok",
      service: "worksphere-api",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check error:", error);

    return res.status(503).json({
      success: false,
      status: "unavailable",
      database: "disconnected",
    });
  }
};

app.get("/health", healthCheck);
app.get("/api/health", healthCheck);

// =====================================================
// 5. REGISTRATION VALIDATION
// =====================================================

const registerSchema = z.object({
  organizationName: z.string().min(2).max(120),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(100),
});

// =====================================================
// 6. ORGANIZATION REGISTRATION
// =====================================================
app.post(
  "/api/auth/register",
  async (req, res, next) => {
    let client: PoolClient | undefined;

    try {
      client = await pool.connect();

      await client.query("BEGIN");

      // Registration logic goes here

      await client.query("COMMIT");

      return res.status(201).json({
        success: true,
        message: "Registration successful",
      });

    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }

      return next(error);

    } finally {
      client?.release();
    }
  }
);


      // Create tenant
      const tenantResult = await client.query(
        `INSERT INTO tenants (name)
         VALUES ($1)
         RETURNING id, name`,
        [parsed.data.organizationName]
      );

      const tenant = tenantResult.rows[0];

      // Hash password
      const hashedPassword = await bcrypt.hash(
        parsed.data.password,
        12
      );

      // Create organization owner
      const userResult = await client.query(
        `INSERT INTO users
         (tenant_id, name, email, password_hash, role)
         VALUES ($1, $2, lower($3), $4, 'organization_owner')
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

      // Generate token
      const token = signToken({
        userId: String(user.id),
        tenantId: String(user.tenant_id),
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
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }

      console.error("Registration error:", error);

      const dbError = error as { code?: string };

      if (dbError.code === "23505") {
        return res.status(409).json({
          success: false,
          error: "Email already registered",
        });
      }

      return next(error);
    } finally {
      client?.release();
    }
  }
);

// =====================================================
// 7. LOGIN VALIDATION
// =====================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// =====================================================
// 8. USER LOGIN
// =====================================================

app.post(
  "/api/auth/login",
  async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }

    try {
      const result = await pool.query(
        `SELECT
           id,
           tenant_id,
           name,
           email,
           password_hash,
           role
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
          success: false,
          error: "Invalid email or password",
        });
      }

      const token = signToken({
        userId: String(user.id),
        tenantId: String(user.tenant_id),
        role: user.role,
        email: user.email,
      });

      // Never return password hash
      delete user.password_hash;

      return res.status(200).json({
        success: true,
        message: "Login successful",
        token,
        user,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 9. CURRENT AUTHENTICATED USER
// =====================================================

app.get(
  "/api/auth/me",
  requireAuth,
  (req, res) => {
    return res.status(200).json({
      success: true,
      user: req.user,
    });
  }
);

// =====================================================
// 10. PROJECT VALIDATION
// =====================================================

const projectSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(5000).optional(),
  dueDate: z.string().date().optional(),
});

// =====================================================
// 11. GET ALL PROJECTS
// =====================================================

app.get(
  "/api/projects",
  requireAuth,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(
        tenantId,
        (client) =>
          client.query(
            `SELECT
               p.*,
               COUNT(t.id)::int AS task_count
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

      return res.status(200).json({
        success: true,
        projects: result.rows,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 12. CREATE PROJECT
// =====================================================

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
        success: false,
        error: "Invalid project",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;

      const project = await withTenant(
        tenantId,
        async (client) => {
          const result = await client.query(
            `INSERT INTO projects
             (tenant_id, name, description, owner_id, due_date)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
              tenantId,
              parsed.data.name,
              parsed.data.description || "",
              userId,
              parsed.data.dueDate || null,
            ]
          );

          const newProject = result.rows[0];

          await client.query(
            `INSERT INTO activity_events
             (tenant_id, actor_id, entity_type, entity_id, action)
             VALUES ($1, $2, 'project', $3, 'created')`,
            [tenantId, userId, newProject.id]
          );

          await client.query(
            `INSERT INTO audit_logs
             (tenant_id, actor_id, action, entity_type, entity_id)
             VALUES ($1, $2, 'project.created', 'project', $3)`,
            [tenantId, userId, newProject.id]
          );

          return newProject;
        }
      );

      return res.status(201).json({
        success: true,
        message: "Project created successfully",
        project,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 13. UPDATE PROJECT
// =====================================================

app.patch(
  "/api/projects/:id",
  requireAuth,
  allowRoles(
    "organization_owner",
    "project_manager",
    "platform_admin"
  ),
  async (req, res, next) => {
    const parsed = z.object({
      name: z.string().min(2).max(180).optional(),
      description: z.string().max(5000).optional(),
      status: z.enum([
        "active",
        "on_hold",
        "completed",
        "archived",
      ]).optional(),
      dueDate: z.string().date().nullable().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid project update",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(
        tenantId,
        (client) =>
          client.query(
            `UPDATE projects
             SET name = COALESCE($3, name),
                 description = COALESCE($4, description),
                 status = COALESCE($5, status),
                 due_date = CASE
                   WHEN $6::boolean THEN $7::date
                   ELSE due_date
                 END,
                 updated_at = NOW()
             WHERE id = $1
               AND tenant_id = $2
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
          success: false,
          error: "Project not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Project updated successfully",
        project: result.rows[0],
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 14. GET PROJECT TASKS
// =====================================================

app.get(
  "/api/projects/:projectId/tasks",
  requireAuth,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(
        tenantId,
        (client) =>
          client.query(
            `SELECT *
             FROM tasks
             WHERE tenant_id = $1
               AND project_id = $2
             ORDER BY created_at DESC`,
            [tenantId, req.params.projectId]
          )
      );

      return res.status(200).json({
        success: true,
        tasks: result.rows,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 15. CREATE TASK
// =====================================================

app.post(
  "/api/projects/:projectId/tasks",
  requireAuth,
  async (req, res, next) => {
    const parsed = z.object({
      title: z.string().min(2).max(240),
      description: z.string().max(5000).optional(),
      priority: z.enum([
        "low",
        "medium",
        "high",
        "urgent",
      ]).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      dueDate: z.string().date().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid task",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;

      const task = await withTenant(
        tenantId,
        async (client) => {
          const result = await client.query(
            `INSERT INTO tasks
             (
               tenant_id,
               project_id,
               title,
               description,
               priority,
               assignee_id,
               due_date
             )
             SELECT
               $1,
               id,
               $3,
               $4,
               $5,
               $6,
               $7
             FROM projects
             WHERE id = $2
               AND tenant_id = $1
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

          const newTask = result.rows[0];

          if (newTask) {
            await client.query(
              `INSERT INTO activity_events
               (tenant_id, actor_id, entity_type, entity_id, action)
               VALUES ($1, $2, 'task', $3, 'created')`,
              [tenantId, userId, newTask.id]
            );
          }

          return newTask;
        }
      );

      if (!task) {
        return res.status(404).json({
          success: false,
          error: "Project not found",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Task created successfully",
        task,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 16. UPDATE TASK
// =====================================================

app.patch(
  "/api/tasks/:id",
  requireAuth,
  async (req, res, next) => {
    const parsed = z.object({
      title: z.string().min(2).max(240).optional(),
      status: z.enum([
        "todo",
        "in_progress",
        "blocked",
        "done",
      ]).optional(),
      priority: z.enum([
        "low",
        "medium",
        "high",
        "urgent",
      ]).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid task update",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(
        tenantId,
        (client) =>
          client.query(
            `UPDATE tasks
             SET title = COALESCE($3, title),
                 status = COALESCE($4, status),
                 priority = COALESCE($5, priority),
                 assignee_id = CASE
                   WHEN $6::boolean THEN $7::uuid
                   ELSE assignee_id
                 END,
                 updated_at = NOW()
             WHERE id = $1
               AND tenant_id = $2
             RETURNING *`,
            [
              req.params.id,
              tenantId,
              parsed.data.title ?? null,
              parsed.data.status ?? null,
              parsed.data.priority ?? null,
              parsed.data.assigneeId !== undefined,
              parsed.data.assigneeId ?? null,
            ]
          )
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Task updated successfully",
        task: result.rows[0],
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 17. ADD TASK COMMENT
// =====================================================

app.post(
  "/api/tasks/:id/comments",
  requireAuth,
  async (req, res, next) => {
    const parsed = z.object({
      body: z.string().min(1).max(5000),
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid comment",
        details: parsed.error.flatten(),
      });
    }

    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;

      const comment = await withTenant(
        tenantId,
        async (client) => {
          const result = await client.query(
            `INSERT INTO comments
             (tenant_id, task_id, author_id, body)
             SELECT $1, t.id, $3, $4
             FROM tasks t
             WHERE t.id = $2
               AND t.tenant_id = $1
             RETURNING *`,
            [
              tenantId,
              req.params.id,
              userId,
              parsed.data.body,
            ]
          );

          return result.rows[0];
        }
      );

      if (!comment) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Comment added successfully",
        comment,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 18. GET ACTIVITY
// =====================================================

app.get(
  "/api/activity",
  requireAuth,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(
        tenantId,
        (client) =>
          client.query(
            `SELECT *
             FROM activity_events
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT 100`,
            [tenantId]
          )
      );

      return res.status(200).json({
        success: true,
        activity: result.rows,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 19. GET AUDIT LOGS
// =====================================================

app.get(
  "/api/audit",
  requireAuth,
  allowRoles(
    "organization_owner",
    "auditor",
    "platform_admin"
  ),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(
        tenantId,
        (client) =>
          client.query(
            `SELECT *
             FROM audit_logs
             WHERE tenant_id = $1
             ORDER BY created_at DESC
             LIMIT 200`,
            [tenantId]
          )
      );

      return res.status(200).json({
        success: true,
        auditLogs: result.rows,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// =====================================================
// 20. GLOBAL ERROR HANDLER
// =====================================================

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("WorkSphere API Error:", error);

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
);

// =====================================================
// 21. START SERVER
// =====================================================

async function startServer(): Promise<void> {
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

// =====================================================
// 22. INITIALIZE APPLICATION
// =====================================================

void startServer();
