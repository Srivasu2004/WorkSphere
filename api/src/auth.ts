
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import jwt from "jsonwebtoken";

// 1. User roles
export type Role =
  | "platform_admin"
  | "organization_owner"
  | "project_manager"
  | "team_member"
  | "auditor";

// 2. Authenticated user
export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
}

// 3. Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// 4. Validate JWT secret
const getSecret = (): string => {
  const value = process.env.JWT_SECRET;

  if (!value || value.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters"
    );
  }

  return value;
};

// 5. Generate JWT token
export function signToken(user: AuthUser): string {
  return jwt.sign(user, getSecret(), {
    expiresIn: "30m",
    issuer: "worksphere",
    algorithm: "HS256",
  });
}

// 6. Authenticate requests
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Authentication required",
    });
    return;
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      error: "Invalid authentication token",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, getSecret(), {
      issuer: "worksphere",
      algorithms: ["HS256"],
    }) as AuthUser;

    // Validate required JWT fields
    if (
      !decoded ||
      typeof decoded.userId !== "string" ||
      typeof decoded.tenantId !== "string" ||
      typeof decoded.email !== "string" ||
      ![
        "platform_admin",
        "organization_owner",
        "project_manager",
        "team_member",
        "auditor",
      ].includes(decoded.role)
    ) {
      res.status(401).json({
        success: false,
        error: "Invalid authentication token",
      });
      return;
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
}

// 7. Role-based authorization
export function allowRoles(...roles: Role[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: "Insufficient permissions",
      });
      return;
    }

    next();
  };
}
