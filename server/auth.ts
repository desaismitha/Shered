import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmailVerification, sendOTPVerificationCode } from "./email";
import { sendOTPVerificationSMS, formatPhoneNumber } from "./sms";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Extend the session interface to include our pendingRegistrations
declare module 'express-session' {
  interface SessionData {
    pendingRegistrations?: Record<string, any>;
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
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  };
  
  console.log("Session settings configured:", {
    maxAge: sessionSettings.cookie?.maxAge,
    secure: sessionSettings.cookie?.secure,
    sameSite: sessionSettings.cookie?.sameSite,
    storeType: storage.sessionStore?.constructor?.name || 'DefaultStore'
  });

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
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (err) {
      console.error('User deserialization error:', err);
      done(err);
    }
  });

  // Endpoint to initiate registration - just validates data and sends OTP code without creating account yet
  app.post("/api/register/init", async (req, res, next) => {
    try {
      console.log("Registration initialization received with body:", JSON.stringify(req.body, null, 2));
      
      // Set username to email value if not explicitly provided
      if (!req.body.username) {
        req.body.username = req.body.email;
      }
      
      // Validate the request data against our schema
      try {
        const { insertUserSchema } = await import("../shared/schema");
        // Create a partial schema without requiring password, for validation only
        const initSchema = insertUserSchema.omit({ password: true }).extend({
          password: insertUserSchema.shape.password.optional(),
        });
        const validatedData = initSchema.parse(req.body);
        // The data is valid, we can continue with validatedData
        req.body = validatedData;
      } catch (validationError) {
        const errorDetails = validationError instanceof Error ? validationError.message : "Invalid registration data";
        console.error("Validation error during registration initialization:", errorDetails);
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationError instanceof Error ? validationError.message : "Invalid input"
        });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ 
          message: "An account with this username already exists. Please use a different username or try logging in." 
        });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ 
          message: "This email is already registered. Please use a different email address or try logging in." 
        });
      }

      // Generate OTP code for verification
      const otpCode = generateOTP();
      
      // Calculate expiry for OTP (10 minutes from now)
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
      
      // Store registration info temporarily in session
      if (!req.session.pendingRegistrations) {
        req.session.pendingRegistrations = {};
      }
      
      // Create a unique registration ID
      const registrationId = randomBytes(16).toString('hex');
      
      // Hash the OTP for secure storage
      const hashedOTP = await hashPassword(otpCode);
      
      // Log invitation details for debugging
      console.log("INVITATION DEBUG - Before storing in session:", JSON.stringify({
        invitation: req.body.invitation,
        token: req.body.token,
        groupId: req.body.groupId
      }, null, 2));
      
      // Store pending registration data
      req.session.pendingRegistrations[registrationId] = {
        ...req.body,
        otpToken: hashedOTP,
        otpExpiry: otpExpiry,
        createdAt: new Date()
      };
      
      // Log what was stored to ensure invitation was properly saved
      console.log("INVITATION DEBUG - After storing in session:", JSON.stringify({
        invitation: req.session.pendingRegistrations[registrationId].invitation,
        token: req.session.pendingRegistrations[registrationId].token,
        groupId: req.session.pendingRegistrations[registrationId].groupId
      }, null, 2));
      
      // Send OTP via email
      const emailOtpSent = await sendOTPVerificationCode(
        req.body.email,
        req.body.displayName || req.body.username,
        otpCode
      );
      
      // Temporarily disabled SMS verification due to issues with Twilio configuration
      let smsOtpSent = false;
      
      if (req.body.phoneNumber) {
        console.log(`SMS verification temporarily disabled, only using email verification`);
      }

      // Include the actual OTP code in the response for development/debugging purposes
      // For troubleshooting, always include the verification code for now
      // In production, this should be removed or made conditional with env variable
      console.log("Using NODE_ENV:", process.env.NODE_ENV);
      console.log("Including verification code in response:", otpCode);
      
      res.status(200).json({
        message: "Verification code sent. Please verify your account to complete registration.",
        registrationId,
        email: req.body.email,
        otpSent: emailOtpSent,
        smsOtpSent,
        // Always include the verification code for now
        verificationCode: otpCode
      });
    } catch (err) {
      next(err);
    }
  });
  
  // Complete registration after OTP verification
  app.post("/api/register/complete", async (req, res, next) => {
    try {
      console.log("[AUTH-DEBUG] POST /api/register/complete Query:", req.query);
      console.log("[AUTH-DEBUG] POST /api/register/complete Body:", JSON.stringify(req.body, null, 2));
      
      const { registrationId, otp } = req.body;
      
      if (!registrationId || !otp) {
        return res.status(400).json({ message: "Registration ID and verification code are required" });
      }
      
      // Retrieve pending registration data
      if (!req.session.pendingRegistrations || !req.session.pendingRegistrations[registrationId]) {
        return res.status(400).json({ message: "Registration session expired or invalid" });
      }
      
      const pendingData = req.session.pendingRegistrations[registrationId];
      
      // Process invitation data from request body if not in pending data
      // This handles cases where the invitation data wasn't properly saved in the registration init phase
      if (!pendingData.invitation && !pendingData.token && !pendingData.groupId) {
        console.log("[AUTH-DEBUG] No invitation data found in pendingData, checking request body");
        if (req.body.invitation || req.body.token || req.body.groupId) {
          console.log("[AUTH-DEBUG] Found invitation data in request body, adding to pendingData");
          
          if (req.body.invitation) {
            console.log("[AUTH-DEBUG] Adding nested invitation data:", req.body.invitation);
            pendingData.invitation = req.body.invitation;
          }
          
          if (req.body.token) {
            console.log("[AUTH-DEBUG] Adding token:", req.body.token);
            pendingData.token = req.body.token;
          }
          
          if (req.body.groupId) {
            console.log("[AUTH-DEBUG] Adding groupId:", req.body.groupId);
            pendingData.groupId = req.body.groupId;
          }
        }
      }
      
      // Check if OTP is expired
      if (new Date() > new Date(pendingData.otpExpiry)) {
        // Clean up expired registration data
        delete req.session.pendingRegistrations[registrationId];
        return res.status(400).json({ message: "Verification code has expired. Please try registering again." });
      }
      
      // Verify OTP
      const isValidOTP = await comparePasswords(otp, pendingData.otpToken);
      if (!isValidOTP) {
        console.log(`OTP verification failed: provided=${otp}, stored hashed=${pendingData.otpToken}`);
        return res.status(400).json({ message: "Invalid verification code" });
      }
      
      console.log(`OTP verification successful for registration ${registrationId}`);
      
      // Generate a SEPARATE verification token (different from OTP) for email link verification
      // This ensures the email link and OTP are different
      const verificationToken = generateVerificationToken(); // This generates a 64-character hex string
      const verificationExpiry = new Date();
      verificationExpiry.setHours(verificationExpiry.getHours() + 24);
      
      console.log(`Creating user with verified email (OTP verified): ${pendingData.email}`);
      
      // Create user now that OTP is verified
      const user = await storage.createUser({
        username: pendingData.username,
        email: pendingData.email,
        displayName: pendingData.displayName,
        phoneNumber: pendingData.phoneNumber,
        password: await hashPassword(pendingData.password),
        emailVerified: true, // Mark as verified since they've completed OTP verification
        verificationToken,
        verificationTokenExpiry: verificationExpiry,
      });
      
      // Clean up the pending registration
      delete req.session.pendingRegistrations[registrationId];
      
      // Construct the backup verification URL (only needed for email link verification)
      const baseUrl = process.env.BASE_URL || `http://${req.headers.host}`;
      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}&userId=${user.id}`;
      
      // Send a welcome email with the verification link as backup
      // This email is separate from the OTP email and contains a different verification token
      const emailSent = await sendEmailVerification(
        user.email,
        user.displayName || user.username,
        verificationUrl
      );
      
      // Enhanced debug logging for invitation processing
      console.log("INVITATION DEBUG - Full pendingData:", JSON.stringify(pendingData, null, 2));
      
      // Extract and handle invitation data properly
      const invitation = pendingData.invitation || {};
      let joinedGroupName = null;
      
      console.log("INVITATION DEBUG - Extracted invitation:", JSON.stringify(invitation, null, 2));
      console.log("INVITATION DEBUG - Direct token/groupId:", {
        token: pendingData.token,
        groupId: pendingData.groupId
      });
      
      // Check for invitation data in either format (nested or direct properties)
      if ((invitation.token && invitation.groupId) || 
          (pendingData.token && pendingData.groupId)) {
        try {
          const token = invitation.token || pendingData.token;
          const groupIdStr = invitation.groupId || pendingData.groupId;
          
          console.log("Processing group invitation during registration with data:", { 
            token, 
            groupId: groupIdStr 
          });
          
          const groupId = parseInt(groupIdStr);
          if (isNaN(groupId)) {
            console.log(`Invalid group ID format: ${groupIdStr}`);
          } else {
            // Verify the group exists
            const group = await storage.getGroup(groupId);
            
            if (!group) {
              console.log(`Group ${groupId} not found during invitation processing`);
            } else {
              console.log(`Found group ${groupId}: ${group.name}`);
              
              try {
                // Add user to the group with member role - wrap in try-catch for better error handling
                try {
                  console.log(`Attempting to add user ${user.id} to group ${groupId}...`);
                  
                  // First check if the user is already a member to avoid duplicates
                  const existingMembers = await storage.getGroupMembers(groupId);
                  const isAlreadyMember = existingMembers.some(member => member.userId === user.id);
                  
                  if (isAlreadyMember) {
                    console.log(`User ${user.id} is already a member of group ${groupId}, skipping addition`);
                    joinedGroupName = group.name;
                  } else {
                    // Not a member yet, so add them
                    console.log(`User ${user.id} is not yet a member of group ${groupId}, adding now...`);
                    
                    const groupMember = await storage.addUserToGroup({
                      groupId,
                      userId: user.id,
                      role: 'member'
                    });
                    
                    // Store the group name for the confirmation email
                    joinedGroupName = group.name;
                    
                    console.log(`User ${user.id} successfully added to group ${groupId} via invitation, returned member:`, groupMember);
                  }
                  
                  // Double-check that the user was added to the group and log the result
                  const groupMembers = await storage.getGroupMembers(groupId);
                  console.log(`Group ${groupId} now has ${groupMembers.length} members`);
                  
                  const userAddedToGroup = groupMembers.some(member => member.userId === user.id);
                  console.log(`Verification check - User ${user.id} in group ${groupId}: ${userAddedToGroup}`);
                  
                  if (!userAddedToGroup) {
                    console.error(`ERROR: User ${user.id} was NOT added to group ${groupId} despite attempt`);
                    console.log(`Current group members:`, JSON.stringify(groupMembers, null, 2));
                  } else {
                    console.log(`SUCCESS: User ${user.id} confirmed as member of group ${groupId}`);
                  }
                } catch (groupAddError) {
                  console.error(`Critical error adding user ${user.id} to group ${groupId}:`, groupAddError);
                  throw groupAddError; // Re-throw to be caught by the outer try-catch
                }
              } catch (addUserError) {
                console.error(`Error adding user ${user.id} to group ${groupId}:`, addUserError);
              }
            }
          }
        } catch (inviteError) {
          console.error("Error processing group invitation during registration:", inviteError);
        }
      } else {
        console.log("No valid invitation data found in registration request");
      }
      
      // Send a registration confirmation email
      try {
        // Import the sendRegistrationConfirmation function from email.ts
        const { sendRegistrationConfirmation } = await import('./email');
        
        console.log(`Sending registration confirmation email to ${user.email}`);
        
        // Send the confirmation email with group information if available
        const confirmationSent = await sendRegistrationConfirmation(
          user.email,
          user.displayName || user.username,
          joinedGroupName || undefined
        );
        
        console.log(`Registration confirmation email sent: ${confirmationSent}`);
        
        if (!confirmationSent) {
          console.warn(`⚠️ Failed to send registration confirmation email to ${user.email}`);
        } else {
          console.log(`✅ Successfully sent registration confirmation email to ${user.email}`);
        }
      } catch (emailError) {
        console.error("Error sending registration confirmation email:", emailError);
      }
      
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
          registrationCompleted: true
        });
      });
    } catch (err) {
      next(err);
    }
  });
  
  // Keep old registration endpoint for backward compatibility, but with deprecation notice
  app.post("/api/register", async (req, res, next) => {
    try {
      console.log("[DEPRECATED] Registration request received with body:", JSON.stringify(req.body, null, 2));
      console.log("Warning: The /api/register endpoint is deprecated. Please use /api/register/init and /api/register/complete");
      
      // Check for invitation data
      if (req.body.invitation) {
        console.log("Invitation data in registration:", JSON.stringify(req.body.invitation, null, 2));
      } else {
        console.log("No invitation data in registration request");
      }
      
      // Set username to email value if not explicitly provided
      if (!req.body.username) {
        req.body.username = req.body.email;
      }
      
      // Validate the request data against our schema
      try {
        const { insertUserSchema } = await import("../shared/schema");
        const validatedData = insertUserSchema.parse(req.body);
        // The data is valid, we can continue with validatedData
        req.body = validatedData;
      } catch (validationError) {
        const errorDetails = validationError instanceof Error ? validationError.message : "Invalid registration data";
        console.error("Validation error during registration:", errorDetails);
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationError instanceof Error ? validationError.message : "Invalid input"
        });
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ 
          message: "An account with this username already exists. Please use a different username or try logging in." 
        });
      }
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).json({ 
          message: "This email is already registered. Please use a different email address or try logging in." 
        });
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
      
      // Send OTP via email
      const emailOtpSent = await sendOTPVerificationCode(
        user.email,
        user.displayName || user.username,
        otpCode
      );
      
      // Temporarily disabled SMS verification due to issues with Twilio configuration
      let smsOtpSent = false;
      if (user.phoneNumber) {
        console.log(`SMS verification temporarily disabled, only using email verification`);
      }

      // Handle group invitation if present in the request
      // Check for invitation data in either format
      const invitation = req.body.invitation || {};
      
      if ((invitation.token && invitation.groupId) || 
          (req.body.token && req.body.groupId)) {
        try {
          const token = invitation.token || req.body.token;
          const groupIdStr = invitation.groupId || req.body.groupId;
          
          console.log("Processing group invitation during registration with data:", { 
            token, 
            groupId: groupIdStr 
          });
          
          const groupId = parseInt(groupIdStr);
          if (isNaN(groupId)) {
            console.log(`Invalid group ID format: ${groupIdStr}`);
            // Continue with registration despite invalid group ID
          } else {
            // Verify the group exists
            const group = await storage.getGroup(groupId);
            
            if (!group) {
              console.log(`Group ${groupId} not found during invitation processing`);
            } else {
              // Add user to the group with member role
              const groupMember = await storage.addUserToGroup({
                groupId,
                userId: user.id,
                role: 'member'
                // joinedAt is handled by the database default
              });
              
              console.log(`User ${user.id} successfully added to group ${groupId} via invitation`);
            }
          }
        } catch (inviteError) {
          // Log but don't fail registration if group invitation fails
          console.error("Error processing group invitation during registration:", inviteError);
        }
      } else {
        console.log("No valid invitation data found in registration request");
      }
      
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
          otpEmailSent: emailOtpSent,
          smsOtpSent,
          requiresVerification: true
        });
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Login request received with body:", JSON.stringify(req.body, null, 2));
    // Specifically check the invitation data structure
    if (req.body.invitation) {
      console.log("Invitation data received:", JSON.stringify(req.body.invitation, null, 2));
    } else {
      console.log("No invitation data in login request");
    }
    passport.authenticate("local", async (err: any, user: SelectUser | false, info: any) => {
      if (err) {
        console.log("Login authentication error:", err);
        return next(err);
      }
      if (!user) {
        console.log("Login failed - invalid credentials");
        return res.status(401).json({ message: "The username/email or password you entered is incorrect. Please try again." });
      }
      console.log("User authenticated successfully:", { id: user.id, username: user.username });
      
      // Handle group invitation if present in the request
      // Check for invitation data in either format
      const invitation = req.body.invitation || {};
      
      if ((invitation.token && invitation.groupId) || 
          (req.body.token && req.body.groupId)) {
        try {
          const token = invitation.token || req.body.token;
          const groupIdStr = invitation.groupId || req.body.groupId;
          
          console.log("Processing group invitation during login with data:", { 
            token, 
            groupId: groupIdStr 
          });
          
          const groupId = parseInt(groupIdStr);
          if (isNaN(groupId)) {
            console.log(`Invalid group ID format: ${groupIdStr}`);
            // Continue with login despite invalid group ID
          } else {
            // Verify the group exists
            const group = await storage.getGroup(groupId);
            
            if (!group) {
              console.log(`Group ${groupId} not found during invitation processing`);
            } else {
              // Check if user is already a member of this group
              const members = await storage.getGroupMembers(groupId);
              const isMember = members.some(member => member.userId === user.id);
              
              if (isMember) {
                console.log(`User ${user.id} is already a member of group ${groupId}`);
              } else {
                // Add user to the group with member role - with better error handling
                try {
                  console.log(`Attempting to add user ${user.id} to group ${groupId} during login...`);
                  
                  const groupMember = await storage.addUserToGroup({
                    groupId,
                    userId: user.id,
                    role: 'member'
                  });
                  
                  console.log(`User ${user.id} successfully added to group ${groupId} via invitation during login:`, groupMember);
                  
                  // Double-check that the user was added to the group and log the result
                  const updatedMembers = await storage.getGroupMembers(groupId);
                  console.log(`Group ${groupId} now has ${updatedMembers.length} members`);
                  
                  const userAddedToGroup = updatedMembers.some(member => member.userId === user.id);
                  console.log(`Verification check - User ${user.id} in group ${groupId}: ${userAddedToGroup}`);
                  
                  if (!userAddedToGroup) {
                    console.error(`ERROR: User ${user.id} was NOT added to group ${groupId} despite attempt`);
                    console.log(`Current group members:`, JSON.stringify(updatedMembers, null, 2));
                  } else {
                    console.log(`SUCCESS: User ${user.id} confirmed as member of group ${groupId}`);
                  }
                } catch (groupAddError) {
                  console.error(`Critical error adding user ${user.id} to group ${groupId} during login:`, groupAddError);
                  throw groupAddError; // Re-throw to be caught by the outer try-catch
                }
              }
            }
          }
        } catch (inviteError) {
          // Log but don't fail login if group invitation fails
          console.error("Error processing group invitation during login:", inviteError);
        }
      } else {
        console.log("No valid invitation data found in login request");
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
  
  // Endpoint to update user driving details
  app.patch("/api/user/driving-details", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      
      console.log("[AUTH] Processing driving details update:", req.body);
      
      const { licenseNumber, licenseState, licenseExpiry, isEligibleDriver } = req.body;
      
      // Update the user with driving details
      const updatedUser = await storage.updateUserDrivingDetails(req.user.id, {
        licenseNumber,
        licenseState,
        licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null,
        isEligibleDriver: !!isEligibleDriver
      });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Return the updated user without password
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('Error updating driving details:', error);
      res.status(500).json({ error: 'Failed to update driving details' });
    }
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
      let userId: number;
      
      // Check if user is authenticated or if userId was provided in request body
      if (req.isAuthenticated()) {
        userId = (req.user as SelectUser).id;
      } else if (req.body && req.body.userId) {
        // Allow requesting OTP without login if userId is explicitly provided
        userId = parseInt(req.body.userId, 10);
      } else {
        return res.status(401).json({ 
          message: "You must be logged in or provide a userId to request an OTP code" 
        });
      }
      
      // Get user details
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Generate a new OTP code with 10-minute expiry
      const otpCode = generateOTP();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);
      
      // Store the hashed OTP
      await storage.updateUserVerification(user.id, {
        otpToken: await hashPassword(otpCode),
        otpTokenExpiry: otpExpiry
      });
      
      // Send the OTP via email
      const emailOtpSent = await sendOTPVerificationCode(
        user.email,
        user.displayName || user.username,
        otpCode
      );
      
      // Temporarily disabled SMS verification due to issues with Twilio configuration
      let smsOtpSent = false;
      if (user.phoneNumber) {
        console.log(`SMS verification temporarily disabled, only using email verification`);
      }
      
      if (!emailOtpSent && !smsOtpSent) {
        return res.status(500).json({ message: "Failed to send OTP code" });
      }
      
      res.status(200).json({ message: "OTP code sent successfully" });
    } catch (err) {
      console.error("Error sending OTP code:", err);
      res.status(500).json({ message: "Server error while sending OTP code" });
    }
  });
}
