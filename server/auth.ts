import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmailVerification, sendOTPVerificationCode } from "./email";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Generate a secure random token for email verification
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

// Generate a 6-digit OTP (One-Time Password)
export function generateOTP(): string {
  // Generate a random number between 100000 and 999999
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'travelgroupr-session-secret',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // First try to find user by email/username
        let user = await storage.getUserByUsername(username);
        
        // If not found, try to find by email (for backward compatibility)
        if (!user) {
          user = await storage.getUserByEmail(username);
        }
        
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Set username to email value if not explicitly provided
      if (!req.body.username) {
        req.body.username = req.body.email;
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email address already in use" });
      }

      // Generate verification token with 24-hour expiry
      const verificationToken = generateVerificationToken();
      const verificationExpiry = new Date();
      verificationExpiry.setHours(verificationExpiry.getHours() + 24);

      // Create user with verification token
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        emailVerified: false,
        verificationToken,
        verificationTokenExpiry: verificationExpiry,
      });

      // Generate OTP code for additional verification
      const otpCode = generateOTP();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // 10 minute expiry
      
      // Store OTP code in the user record
      await storage.updateUserVerification(user.id, {
        otpToken: await hashPassword(otpCode), // Store hashed OTP for security
        otpTokenExpiry: otpExpiry
      });

      // Construct the verification URL
      const baseUrl = process.env.BASE_URL || `http://${req.headers.host}`;
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}&userId=${user.id}`;
      
      // Send verification email
      const emailSent = await sendEmailVerification(
        user.email,
        user.displayName || user.username,
        verificationUrl
      );
      
      // Send OTP email
      const otpSent = await sendOTPVerificationCode(
        user.email,
        user.displayName || user.username,
        otpCode
      );

      // Remove password and sensitive fields from response
      const { 
        password, 
        verificationToken: token, 
        otpToken,
        ...userWithoutSensitiveData 
      } = user;

      // Log the user in automatically
      req.login(user, (err) => {
        if (err) return next(err);
        
        res.status(201).json({
          ...userWithoutSensitiveData,
          verificationEmailSent: emailSent,
          otpEmailSent: otpSent,
          requiresVerification: true
        });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: "Invalid username/email or password" });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        
        // Remove password from response
        const { password, ...userWithoutPassword } = user;
        res.status(200).json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    // Remove password from response
    const { password, ...userWithoutPassword } = req.user as SelectUser;
    res.json(userWithoutPassword);
  });
  
  // Email verification endpoint
  app.get("/api/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Invalid verification token" });
      }
      
      const success = await storage.verifyUserEmail(token);
      
      if (!success) {
        return res.status(400).json({ 
          message: "Email verification failed. Token may be invalid or expired." 
        });
      }
      
      res.status(200).json({ message: "Email verified successfully" });
    } catch (err) {
      console.error("Email verification error:", err);
      res.status(500).json({ message: "Server error during email verification" });
    }
  });
  
  // OTP verification endpoint
  app.post("/api/verify-otp", async (req, res) => {
    try {
      const { userId, otp } = req.body;
      
      if (!userId || !otp) {
        return res.status(400).json({ message: "User ID and OTP code are required" });
      }
      
      const success = await storage.verifyUserOtp(userId, otp);
      
      if (!success) {
        return res.status(400).json({ 
          message: "OTP verification failed. Code may be invalid or expired." 
        });
      }
      
      res.status(200).json({ message: "OTP verified successfully" });
    } catch (err) {
      console.error("OTP verification error:", err);
      res.status(500).json({ message: "Server error during OTP verification" });
    }
  });
  
  // Resend verification email endpoint
  app.post("/api/resend-verification", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "You must be logged in to resend verification" });
      }
      
      const user = req.user as SelectUser;
      
      // Generate a new verification token with 24-hour expiry
      const verificationToken = generateVerificationToken();
      const verificationExpiry = new Date();
      verificationExpiry.setHours(verificationExpiry.getHours() + 24);
      
      // Store the new token
      await storage.updateUserVerification(user.id, {
        verificationToken,
        verificationTokenExpiry: verificationExpiry
      });
      
      // Construct the verification URL
      const baseUrl = process.env.BASE_URL || `http://${req.headers.host}`;
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;
      
      // Send a new verification email
      const emailSent = await sendEmailVerification(
        user.email,
        user.displayName || user.username,
        verificationUrl
      );
      
      if (!emailSent) {
        return res.status(500).json({ message: "Failed to send verification email" });
      }
      
      res.status(200).json({ message: "Verification email resent successfully" });
    } catch (err) {
      console.error("Error resending verification email:", err);
      res.status(500).json({ message: "Server error while resending verification email" });
    }
  });
  
  // Request new OTP code endpoint
  app.post("/api/request-otp", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "You must be logged in to request an OTP code" });
      }
      
      const user = req.user as SelectUser;
      
      // Generate a new OTP code with 10-minute expiry
      const otpCode = generateOTP();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
      
      // Store the hashed OTP
      await storage.updateUserVerification(user.id, {
        otpToken: await hashPassword(otpCode),
        otpTokenExpiry: otpExpiry
      });
      
      // Send the OTP email
      const otpSent = await sendOTPVerificationCode(
        user.email,
        user.displayName || user.username,
        otpCode
      );
      
      if (!otpSent) {
        return res.status(500).json({ message: "Failed to send OTP code" });
      }
      
      res.status(200).json({ message: "OTP code sent successfully" });
    } catch (err) {
      console.error("Error sending OTP code:", err);
      res.status(500).json({ message: "Server error while sending OTP code" });
    }
  });
}
