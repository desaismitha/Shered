import { Request, Response } from 'express';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { sendOTPVerificationSMS, formatPhoneNumber } from './sms';

// Constants
const OTP_EXPIRY_MINUTES = 10;

/**
 * Generate a random 6-digit OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Setup phone verification routes
 */
export function setupPhoneVerificationRoutes(app: any) {
  /**
   * Send verification code to phone number
   * POST /api/verify/phone/send
   */
  app.post('/api/verify/phone/send', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Try to format the phone number
      let formattedPhoneNumber;
      try {
        formattedPhoneNumber = formatPhoneNumber(phoneNumber);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid phone number format. Please use E.164 format (e.g., +12345678901)' });
      }

      // Generate a new OTP code
      const verificationCode = generateOTP();
      const otpTokenExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      // Store OTP in the user record
      await db.update(users)
        .set({
          otpToken: verificationCode,
          otpTokenExpiry: otpTokenExpiry,
          phoneNumber: formattedPhoneNumber, // Store the formatted phone number
        })
        .where(eq(users.id, req.user.id));

      // Send OTP via SMS
      // This would typically be sent via SMS, but for testing, we'll also return it in the response
      console.log(`Sending OTP ${verificationCode} to ${formattedPhoneNumber}`);
      
      try {
        const sent = await sendOTPVerificationSMS(
          formattedPhoneNumber,
          req.user.username,
          verificationCode
        );
        
        if (!sent) {
          console.warn('SMS service failed to send OTP, but proceeding with verification flow');
        }
      } catch (smsError) {
        console.error('Error sending SMS:', smsError);
        // Continue even if SMS failed, as we're displaying the code in the UI for testing
      }

      // Return success response with the verification code (for testing only)
      // In production, we wouldn't include the verification code in the response
      res.status(200).json({
        success: true,
        message: 'Verification code sent',
        verificationCode: verificationCode, // Including for testing
        expiresIn: OTP_EXPIRY_MINUTES
      });
    } catch (error) {
      console.error('Error sending verification code:', error);
      res.status(500).json({ error: 'Failed to send verification code' });
    }
  });

  /**
   * Verify OTP code
   * POST /api/verify/phone/verify
   */
  app.post('/api/verify/phone/verify', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { phoneNumber, verificationCode } = req.body;
      
      if (!phoneNumber || !verificationCode) {
        return res.status(400).json({ error: 'Phone number and verification code are required' });
      }

      // Get the user record to check the OTP
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, req.user.id));

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Check if OTP is valid and not expired
      if (!user.otpToken || !user.otpTokenExpiry) {
        return res.status(400).json({ error: 'No verification code was requested or it has already been used' });
      }

      if (new Date() > new Date(user.otpTokenExpiry)) {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one' });
      }

      if (user.otpToken !== verificationCode) {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      // Try to format the phone number
      let formattedPhoneNumber;
      try {
        formattedPhoneNumber = formatPhoneNumber(phoneNumber);
      } catch (error) {
        return res.status(400).json({ error: 'Invalid phone number format' });
      }

      // Verify the phone number and clear OTP token
      await db.update(users)
        .set({
          phoneNumber: formattedPhoneNumber, // Store the formatted phone number
          otpToken: null,
          otpTokenExpiry: null,
        })
        .where(eq(users.id, req.user.id));

      // Return success response
      res.status(200).json({
        success: true,
        message: 'Phone number verified successfully',
      });
    } catch (error) {
      console.error('Error verifying phone number:', error);
      res.status(500).json({ error: 'Failed to verify phone number' });
    }
  });
}
