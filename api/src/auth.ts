
import type {
  Request,
  Response,
  NextFunction,
} from "express";

import jwt from "jsonwebtoken";

// =====================================================
// 1. USER ROLES
// =====================================================

export type Role =
  | "platform_admin"
  | "organization_owner"
  | "project_manager"
  | "team_member"
  | "auditor";

// =====================================================
// 2. AUTHENTICATED USER INTERFACE
// =====================================================

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
}

// =====================================================
// 3. EXPRESS REQUEST EXTENSION
// =====================================================

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// =====================================================
// 4. JWT SECRET VALIDATION
// =====================================================

const getSecret = (): string => {
  const value = process.env.JWT_SECRET;

  if (!value || value.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters"
    );
  }

  return value;
};

// =====================================================
// 5. GENERATE JWT TOKEN
// =====================================================

export function signToken(user: AuthUser): string {
  return jwt.sign(
    user,
    getSecret(),
    {
      expiresIn: "30m",
      issuer: "worksphere",
      algorithm: "HS256",
    }
  );
}

// =====================================================
// 6. AUTHENTICATION MIDDLEWARE
// =====================================================

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {

  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
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
    const decoded = jwt.verify(
      token,
      getSecret(),
      {
        issuer: "worksphere",
        algorithms: ["HS256"],
      }
    ) as AuthUser;

    req.user = decoded;

    next();

  } catch (error) {
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });

    return;
  }
}

// =====================================================
// 7. ROLE-BASED AUTHORIZATION
// =====================================================

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

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
export type Role = "platform_admin"|"organization_owner"|"project_manager"|"team_member"|"auditor";
export interface AuthUser { userId:string; tenantId:string; role:Role; email:string }
declare global { namespace Express { interface Request { user?: AuthUser } } }
const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return value;
};
export function signToken(user: AuthUser) { return jwt.sign(user, secret(), { expiresIn:"30m", issuer:"worksphere" }); }
export function requireAuth(req:Request,res:Response,next:NextFunction) {
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
  if(!token) return res.status(401).json({error:"Authentication required"});
  try { req.user=jwt.verify(token,secret(),{issuer:"worksphere"}) as AuthUser; next(); }
  catch { return res.status(401).json({error:"Invalid or expired token"}); }
}
export function allowRoles(...roles:Role[]) {
  return (req:Request,res:Response,next:NextFunction) => {
    if(!req.user || !roles.includes(req.user.role)) return res.status(403).json({error:"Insufficient permissions"});
    next();
  };
}
export const authenticate = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.headers.authorization) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    next();
};
import { Request, Response, NextFunction } from "express";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.headers.authorization) {
    res.status(401).json({
      success: false,
      message: "Unauthorized"
    });
    return;
  }

  next();
};

  import { Request, Response, NextFunction } from "express";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Your authentication logic

    next();
    return;
  } catch (error) {
    res.status(401).json({
      message: "Authentication failed"
    });
    return;
  }
};
  
};
