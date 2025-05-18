import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will be disabled.");
}

if (!process.env.SENDGRID_VERIFIED_SENDER) {
  console.warn("SENDGRID_VERIFIED_SENDER environment variable is not set. Email functionality will use a default sender, which may cause errors.");
}

// Create a function to always get a fresh instance of the mail service
// This ensures we always have an up-to-date client with the latest API key
function getMailService(): MailService {
  const apiKey = process.env.SENDGRID_API_KEY || '';
  console.log('[SENDGRID_DEBUG] Setting up mail service with API key length:', apiKey.length);
  const mailService = new MailService();
  mailService.setApiKey(apiKey);
  return mailService;
}

export interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    // Enhanced logging to debug SendGrid configuration
    console.log('[SENDGRID_DEBUG] API Key configured:', !!process.env.SENDGRID_API_KEY);
    console.log('[SENDGRID_DEBUG] Verified Sender:', process.env.SENDGRID_VERIFIED_SENDER || 'not set');
    
    if (!process.env.SENDGRID_API_KEY) {
      console.error('[SENDGRID_ERROR] SendGrid API key is not set');
      return false;
    }
    
    console.log(`[SENDGRID_INFO] Attempting to send email to ${params.to} with subject "${params.subject}"`);
    console.log(`[SENDGRID_INFO] Using sender: ${params.from || process.env.SENDGRID_VERIFIED_SENDER || 'unknown'}`);
    
    // Ensure we have a valid from address - this is required by SendGrid
    const fromEmail = params.from || process.env.SENDGRID_VERIFIED_SENDER;
    if (!fromEmail) {
      console.error('No from email provided and SENDGRID_VERIFIED_SENDER not set');
      return false;
    }
    
    const emailPayload = {
      to: params.to,
      from: fromEmail,
      subject: params.subject,
      text: params.text || 'No text content provided',
      html: params.html || '<p>No HTML content provided</p>',
    };
    
    console.log('Email payload:', { 
      to: emailPayload.to,
      from: emailPayload.from,
      subject: emailPayload.subject,
      textLength: emailPayload.text?.length || 0,
      htmlLength: emailPayload.html?.length || 0
    });
    
    // Check if any payload fields are missing
    if (!emailPayload.to || !emailPayload.from || !emailPayload.subject) {
      console.error('Missing required email fields:', { 
        hasTo: !!emailPayload.to, 
        hasFrom: !!emailPayload.from, 
        hasSubject: !!emailPayload.subject 
      });
      return false;
    }
    
    try {
      // Get a fresh mail service instance for each email send
      const mailService = getMailService();
      
      // Send the email with detailed logging
      console.log(`[SENDGRID] About to send email to ${params.to}`);
      console.log(`[SENDGRID] Send request initiated...`);
      
      await mailService.send(emailPayload);
      
      console.log(`[SENDGRID] Email successfully sent to ${params.to}`);
      return true;
    } catch (sendError) {
      console.error('[SENDGRID] Send() error:', sendError);
      if (sendError instanceof Error) {
        console.error('[SENDGRID] Send error details:', sendError.message);
        console.error('[SENDGRID] Send error name:', sendError.name);
        console.error('[SENDGRID] Send error stack:', sendError.stack);
      }
      
      // Extract error response if available
      // SendGrid errors have a specific shape
      const sgError = sendError as any;
      if (sgError?.response?.body) {
        console.error('[SENDGRID] API Response:', JSON.stringify(sgError.response.body, null, 2));
      }
      
      return false;
    }
  } catch (error) {
    console.error('[SENDGRID] Email preparation error:', error);
    if (error instanceof Error) {
      console.error('[SENDGRID] Error details:', error.message);
      console.error('[SENDGRID] Error stack:', error.stack);
    }
    return false;
  }
}

export async function sendGroupInvitation(
  email: string, 
  groupName: string, 
  inviterName: string,
  inviteLink: string,
  isExistingUser: boolean = false
): Promise<boolean> {
  console.log(`[GROUP_INVITATION] Attempting to send ${isExistingUser ? 'member added' : 'new invitation'} email to ${email} for group "${groupName}"`);
  console.log(`[GROUP_INVITATION] Invite details: inviter=${inviterName}, link=${inviteLink}, isExistingUser=${isExistingUser}`);

  // Check for valid SendGrid configuration
  console.log('[SENDGRID_DEBUG] API Key configured:', !!process.env.SENDGRID_API_KEY);
  console.log('[SENDGRID_DEBUG] Verified Sender:', process.env.SENDGRID_VERIFIED_SENDER);
  
  if (!process.env.SENDGRID_API_KEY) {
    console.error('[GROUP_INVITATION] SendGrid API key is not configured');
    return false;
  }
  
  if (!process.env.SENDGRID_VERIFIED_SENDER) {
    console.warn('[GROUP_INVITATION] SendGrid verified sender is not configured, using fallback');
  }
  
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  const subject = isExistingUser 
    ? `You've been added to ${groupName} on TrustLoopz` 
    : `You've been invited to join ${groupName} on TrustLoopz`;
  
  let text, html;
  
  if (isExistingUser) {
    // Template for existing users
    text = `
      Hi there!
      
      ${inviterName} has added you to the travel group "${groupName}" on TrustLoopz.
      
      To view the group and plan trips, please visit:
      ${inviteLink}
      
      Happy travels!
      The TravelGroupr Team
    `;
    
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been added to a travel group!</h2>
        <p><strong>${inviterName}</strong> has added you to the travel group <strong>"${groupName}"</strong> on TravelGroupr.</p>
        <p>You can now collaborate on trips, share expenses, and coordinate travel plans with the group members.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            View Group
          </a>
        </div>
        <p>Happy travels!<br>The TravelGroupr Team</p>
      </div>
    `;
  } else {
    // Template for new users
    text = `
      Hi there!
      
      ${inviterName} has invited you to join their travel group "${groupName}" on TravelGroupr.
      
      To accept the invitation and create your account, please visit:
      ${inviteLink}
      
      Happy travels!
      The TravelGroupr Team
    `;
    
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to TravelGroupr!</h2>
        <p><strong>${inviterName}</strong> has invited you to join their travel group <strong>"${groupName}"</strong> on TravelGroupr.</p>
        <p>TravelGroupr makes it easy to plan trips with friends and family, create itineraries, and share expenses.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Accept Invitation & Create Account
          </a>
        </div>
        <p>Happy travels!<br>The TravelGroupr Team</p>
      </div>
    `;
  }
  
  console.log(`[GROUP_INVITATION] Sending ${isExistingUser ? 'existing user' : 'new user'} invitation email to ${email}`);
  
  try {
    const result = await sendEmail({
      to: email,
      from: fromEmail,
      subject,
      text,
      html
    });
    
    console.log(`[GROUP_INVITATION] Result of sending invitation email to ${email}: ${result ? 'SUCCESS' : 'FAILED'}`);
    return result;
  } catch (error) {
    console.error(`[GROUP_INVITATION] Error sending invitation email to ${email}:`, error);
    return false;
  }
}

export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetLink: string
): Promise<boolean> {
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com';
  const subject = 'Password Reset for TrustLoopz';
  
  const text = `
    Hi ${username},
    
    We received a request to reset your password for your TravelGroupr account.
    
    To reset your password, please visit:
    ${resetLink}
    
    This link will expire in 1 hour.
    
    If you didn't request this, you can safely ignore this email.
    
    Best regards,
    The TravelGroupr Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Reset Your TravelGroupr Password</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>We received a request to reset your password for your TravelGroupr account.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Reset Password
        </a>
      </div>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>Best regards,<br>The TravelGroupr Team</p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

export async function sendEmailVerification(
  email: string,
  username: string,
  verificationLink: string
): Promise<boolean> {
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com';
  const subject = 'Welcome to Shered!';
  
  const text = `
    Hi ${username},
    
    Thank you for signing up with Shered! Your account has been successfully created.
    
    Your account is already active since you verified it with the one-time code during registration.
    
    As a backup option, you can also verify your email address by clicking the link below:
    ${verificationLink}
    
    This backup verification link will expire in 24 hours.
    
    If you didn't create an account, please ignore this email.
    
    Best regards,
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to Shered!</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Thank you for signing up with Shered. Your account has been successfully created!</p>
      
      <p style="background-color: #d1e7dd; padding: 10px; border-radius: 4px; border-left: 4px solid #198754;">
        <strong>Your account is already active</strong> since you verified it with the one-time code during registration.
      </p>
      
      <p>As a backup option, you can also verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 20px 0;">
        <a href="${verificationLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Verify Email Address (Backup Option)
        </a>
      </div>
      <p>This backup verification link will expire in 24 hours.</p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
      <p>Best regards,<br>The Shered Team</p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

export async function sendOTPVerificationCode(
  email: string,
  username: string,
  otp: string
): Promise<boolean> {
  console.log(`[OTP-EMAIL] Attempting to send OTP code ${otp} to ${email} for user ${username}`);
  
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  // Include the code in the subject line for quick reference, even if the email is not opened
  const subject = `Your Shered Verification Code: ${otp}`;
  
  const text = `
    Hi ${username},
    
    Your one-time registration code for Shered is: ${otp}
    
    Please enter this code in the verification form that appeared when you registered.
    This code will expire in 10 minutes.
    
    IMPORTANT: This verification code is different from the verification link you will receive in a separate welcome email.
    
    If you didn't request this code, please ignore this email.
    
    Best regards,
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your Shered Registration Code</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Please use the following code to complete your registration:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="font-size: 24px; letter-spacing: 5px; font-weight: bold; background-color: #f5f5f5; padding: 15px; border-radius: 4px;">
          ${otp}
        </div>
      </div>
      <p><strong>Please enter this code in the verification form</strong> that appeared when you registered.</p>
      <p>This code will expire in 10 minutes.</p>
      <p style="background-color: #fff3cd; padding: 10px; border-radius: 4px; border-left: 4px solid #ffc107;">
        <strong>Important:</strong> This verification code is different from the verification link you will receive in a separate welcome email.
      </p>
      <p>If you didn't request this code, please ignore this email.</p>
      <p>Best regards,<br>The Shered Team</p>
    </div>
  `;
  
  const result = await sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
  
  console.log(`[OTP-EMAIL] Result of sending OTP email to ${email}: ${result ? 'SUCCESS' : 'FAILED'}`);
  return result;
}

/**
 * Send a route deviation notification via email
 * @param email Recipient's email address
 * @param username Recipient's username/display name
 * @param tripName Name of the trip
 * @param deviatedUserName Name of the person who deviated from the route
 * @param distanceFromRoute Distance from planned route in kilometers
 * @param latitude Current latitude
 * @param longitude Current longitude
 * @returns Promise<boolean> indicating success or failure
 */
export async function sendRouteDeviationEmail(
  email: string,
  username: string,
  tripName: string,
  deviatedUserName: string,
  distanceFromRoute: number,
  latitude: number,
  longitude: number
): Promise<boolean> {
  console.log(`[DEVIATION_EMAIL] Preparing route deviation email to ${email} for trip ${tripName}`);
  
  // Use consistent shered.com domain
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  const subject = `🚨 Route Deviation Alert: ${tripName}`;
  
  // Format the distance to 2 decimal places
  const formattedDistance = typeof distanceFromRoute === 'number' 
    ? distanceFromRoute.toFixed(2) 
    : 'unknown';
  
  // Generate a Google Maps link with the coordinates
  const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;
  
  console.log(`[DEVIATION_EMAIL] Maps link: ${mapsLink}`);
  console.log(`[DEVIATION_EMAIL] Using sender: ${fromEmail}`);
  
  const text = `
    Hi ${username},
    
    This is an important alert regarding your trip "${tripName}".
    
    ${deviatedUserName} has deviated from the planned route by ${formattedDistance}km.
    
    Current location: ${latitude}, ${longitude}
    View on Google Maps: ${mapsLink}
    
    You're receiving this notification because you're a member of this trip's group.
    
    Best regards,
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc3545;">⚠️ Route Deviation Alert</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>This is an important alert regarding your trip <strong>"${tripName}"</strong>.</p>
      
      <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 16px;">
          <strong>${deviatedUserName}</strong> has deviated from the planned route by <strong>${formattedDistance}km</strong>.
        </p>
      </div>
      
      <p><strong>Current location:</strong> ${latitude}, ${longitude}</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${mapsLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          View on Google Maps
        </a>
      </div>
      
      <p>You're receiving this notification because you're a member of this trip's group.</p>
      
      <p>Best regards,<br>The Shered Team</p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

/**
 * Send a trip status change notification via email
 * @param email Recipient's email address
 * @param username Recipient's username/display name
 * @param tripName Name of the trip
 * @param newStatus New status of the trip ('planning', 'confirmed', 'in-progress', or 'completed')
 * @param startLocation Trip start location (optional)
 * @param destination Trip destination (optional)
 * @param startDate Trip start date (optional)
 * @param endDate Trip end date (optional)
 * @returns Promise<boolean> indicating success or failure
 */
/**
 * Send registration confirmation email to the user
 * @param email Recipient's email address
 * @param username Recipient's username/display name
 * @param groupName Name of the group they were invited to (optional)
 * @returns Promise<boolean> indicating success or failure
 */
export async function sendRegistrationConfirmation(
  email: string,
  username: string,
  groupName?: string
): Promise<boolean> {
  console.log(`[REGISTRATION_CONFIRMATION] Sending confirmation email to ${email}`);
  
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  const subject = 'Welcome to Shered - Registration Confirmed';
  
  const text = `
    Hi ${username},

    Your registration with Shered has been successfully completed!
    ${groupName ? `You have been added to the group "${groupName}".` : ''}

    You can now log in and start planning trips with your groups.

    Best regards,
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="background-color: #4F46E5; color: white; padding: 15px; text-align: center; border-radius: 4px 4px 0 0;">Welcome to Shered!</h2>
      <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 4px 4px;">
        <p>Hi <strong>${username}</strong>,</p>
        <p style="font-size: 18px; color: #4F46E5; font-weight: bold;">Your registration has been successfully completed!</p>
        ${groupName ? `<p>You have been added to the group "<strong>${groupName}</strong>".</p>` : ''}
        <p>You can now log in and start planning trips with your groups.</p>
        <p>Best regards,<br>The Shered Team</p>
      </div>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

/**
 * Send a trip reminder notification via email
 * @param email Recipient's email address
 * @param username Recipient's username/display name
 * @param tripName Name of the trip
 * @param startLocation Trip start location
 * @param destination Trip destination
 * @param startDate Trip start date/time
 * @param minutesUntilStart Number of minutes until the trip starts
 * @returns Promise<boolean> indicating success or failure
 */
export async function sendTripReminderEmail(
  email: string,
  username: string,
  tripName: string,
  startLocation: string | null,
  destination: string | null,
  startDate: Date,
  minutesUntilStart: number
): Promise<boolean> {
  console.log(`[REMINDER_EMAIL] Sending ${minutesUntilStart}-minute reminder to ${email} for trip "${tripName}"`);
  
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  const subject = `🕒 Trip Reminder: "${tripName}" starts in ${minutesUntilStart} minute${minutesUntilStart === 1 ? '' : 's'}`;
  
  // Format the start date/time
  const formattedStartTime = startDate ? new Date(startDate).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) : 'unknown time';
  
  const text = `
    Hi ${username},
    
    This is a reminder that your trip "${tripName}" will start in ${minutesUntilStart} minute${minutesUntilStart === 1 ? '' : 's'}.
    
    Trip Details:
    - Start Time: ${formattedStartTime}
    - Start Location: ${startLocation || 'Not specified'}
    - Destination: ${destination || 'Not specified'}
    
    Please make sure you're ready and at the starting location.
    
    Safe travels!
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">🕒 Trip Reminder</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>This is a reminder that your trip <strong>"${tripName}"</strong> will start in <strong>${minutesUntilStart} minute${minutesUntilStart === 1 ? '' : 's'}</strong>.</p>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #111827;">Trip Details:</h3>
        <p style="margin-bottom: 5px;"><strong>Start Time:</strong> ${formattedStartTime}</p>
        <p style="margin-bottom: 5px;"><strong>Start Location:</strong> ${startLocation || 'Not specified'}</p>
        <p style="margin-bottom: 0;"><strong>Destination:</strong> ${destination || 'Not specified'}</p>
      </div>
      
      <p>Please make sure you're ready and at the starting location.</p>
      <p>Safe travels!<br>The Shered Team</p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

/**
 * Send a trip end-time reminder notification via email
 * @param email Recipient's email address
 * @param username Recipient's username/display name
 * @param tripName Name of the trip
 * @param startLocation Trip start location
 * @param destination Trip destination
 * @param endDate Trip end date/time
 * @param minutesUntilEnd Number of minutes until the trip ends
 * @returns Promise<boolean> indicating success or failure
 */
export async function sendTripEndReminderEmail(
  email: string,
  username: string,
  tripName: string,
  startLocation: string | null,
  destination: string | null,
  endDate: Date,
  minutesUntilEnd: number
): Promise<boolean> {
  console.log(`[END_REMINDER_EMAIL] Sending ${minutesUntilEnd}-minute end reminder to ${email} for trip "${tripName}"`);
  
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  const subject = `🔔 Trip End Reminder: "${tripName}" ends in ${minutesUntilEnd} minute${minutesUntilEnd === 1 ? '' : 's'}`;
  
  // Format the end date/time
  const formattedEndTime = endDate ? new Date(endDate).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) : 'unknown time';
  
  const text = `
    Hi ${username},
    
    This is a reminder that your trip "${tripName}" will end in ${minutesUntilEnd} minute${minutesUntilEnd === 1 ? '' : 's'}.
    
    Trip Details:
    - End Time: ${formattedEndTime}
    - Start Location: ${startLocation || 'Not specified'}
    - Destination: ${destination || 'Not specified'}
    
    Please make sure to wrap up your activities and be ready to conclude the trip.
    
    Safe travels!
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">🔔 Trip End Reminder</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>This is a reminder that your trip <strong>"${tripName}"</strong> will end in <strong>${minutesUntilEnd} minute${minutesUntilEnd === 1 ? '' : 's'}</strong>.</p>
      
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #111827;">Trip Details:</h3>
        <p style="margin-bottom: 5px;"><strong>End Time:</strong> ${formattedEndTime}</p>
        <p style="margin-bottom: 5px;"><strong>Start Location:</strong> ${startLocation || 'Not specified'}</p>
        <p style="margin-bottom: 0;"><strong>Destination:</strong> ${destination || 'Not specified'}</p>
      </div>
      
      <p>Please make sure to wrap up your activities and be ready to conclude the trip.</p>
      <p>Thank you for using Shered!<br>The Shered Team</p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

export async function sendTripStatusChangeEmail(
  email: string,
  username: string,
  tripName: string,
  newStatus: string,
  startLocation?: string,
  destination?: string,
  startDate?: Date,
  endDate?: Date
): Promise<boolean> {
  console.log(`[STATUS_EMAIL] Preparing trip status change email to ${email} for trip ${tripName}, new status: ${newStatus}`);
  
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@shered.com';
  
  // Format the status for display
  const statusDisplay = newStatus === 'in-progress' ? 'In Progress' : 
                        newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
  
  // Set a different subject line and icon based on the new status
  let subject = '';
  let icon = '';
  let statusColor = '';
  let statusMessage = '';
  
  switch(newStatus) {
    case 'in-progress':
      subject = `🚗 Your Trip "${tripName}" Has Started`;
      icon = '🚗';
      statusColor = '#4F46E5'; // Blue for in-progress
      statusMessage = 'Your trip has started! Safe travels!';
      break;
    case 'completed':
      subject = `✅ Your Trip "${tripName}" Has Been Completed`;
      icon = '✅';
      statusColor = '#16a34a'; // Green for completed
      statusMessage = 'Your trip has been marked as completed. We hope you had a great journey!';
      break;
    case 'confirmed':
      subject = `👍 Your Trip "${tripName}" Has Been Confirmed`;
      icon = '👍';
      statusColor = '#2563eb'; // Blue for confirmed
      statusMessage = 'All members have checked in and your trip is confirmed!';
      break;
    case 'planning':
    default:
      subject = `📋 Trip Status Update: "${tripName}"`;
      icon = '📋';
      statusColor = '#6b7280'; // Gray for planning or default
      statusMessage = 'Your trip status has been updated to Planning stage.';
  }
  
  // Format dates if available
  const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Not specified';
  
  const formattedEndDate = endDate ? new Date(endDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) : 'Not specified';
  
  const text = `
    Hi ${username},
    
    Your trip "${tripName}" has been updated to status: ${statusDisplay}.
    
    ${statusMessage}
    
    Trip Details:
    Start Location: ${startLocation || 'Not specified'}
    Destination: ${destination || 'Not specified'}
    Start Date: ${formattedStartDate}
    End Date: ${formattedEndDate}
    
    Visit the app to view more details about your trip.
    
    Best regards,
    The Shered Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${icon} Trip Status Update</h2>
      <p>Hi <strong>${username}</strong>,</p>
      
      <div style="background-color: #f9fafb; border-left: 4px solid ${statusColor}; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-size: 16px;">
          Your trip <strong>"${tripName}"</strong> has been updated to status: <strong style="color: ${statusColor}">${statusDisplay}</strong>
        </p>
      </div>
      
      <p>${statusMessage}</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #333;">Trip Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; width: 40%;"><strong>Start Location:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${startLocation || 'Not specified'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Destination:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${destination || 'Not specified'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;"><strong>Start Date:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">${formattedStartDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>End Date:</strong></td>
            <td style="padding: 8px 0;">${formattedEndDate}</td>
          </tr>
        </table>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="#" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          View Trip Details
        </a>
      </div>
      
      <p>Best regards,<br>The Shered Team</p>
    </div>
  `;
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}