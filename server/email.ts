import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY environment variable is not set. Email functionality will be disabled.");
}

if (!process.env.SENDGRID_VERIFIED_SENDER) {
  console.warn("SENDGRID_VERIFIED_SENDER environment variable is not set. Email functionality will use a default sender, which may cause errors.");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY || '');

export interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key is not set');
      return false;
    }
    
    console.log(`Attempting to send email to ${params.to} with subject "${params.subject}"`);
    
    await mailService.send({
      to: params.to,
      from: (params.from || process.env.SENDGRID_VERIFIED_SENDER || '') as string,
      subject: params.subject,
      text: (params.text || '') as string,
      html: (params.html || '') as string,
    });
    
    console.log(`Email successfully sent to ${params.to}`);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
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
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com';
  const subject = isExistingUser 
    ? `You've been added to ${groupName} on TravelGroupr` 
    : `You've been invited to join ${groupName} on TravelGroupr`;
  
  let text, html;
  
  if (isExistingUser) {
    // Template for existing users
    text = `
      Hi there!
      
      ${inviterName} has added you to the travel group "${groupName}" on TravelGroupr.
      
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
  
  return sendEmail({
    to: email,
    from: fromEmail,
    subject,
    text,
    html
  });
}

export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetLink: string
): Promise<boolean> {
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com';
  const subject = 'Password Reset for TravelGroupr';
  
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
  const subject = 'Welcome to TravelGroupr!';
  
  const text = `
    Hi ${username},
    
    Thank you for signing up with TravelGroupr! Your account has been successfully created.
    
    Your account is already active since you verified it with the one-time code during registration.
    
    As a backup option, you can also verify your email address by clicking the link below:
    ${verificationLink}
    
    This backup verification link will expire in 24 hours.
    
    If you didn't create an account, please ignore this email.
    
    Best regards,
    The TravelGroupr Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to TravelGroupr!</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Thank you for signing up with TravelGroupr. Your account has been successfully created!</p>
      
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

export async function sendOTPVerificationCode(
  email: string,
  username: string,
  otp: string
): Promise<boolean> {
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com';
  const subject = 'Your One-Time Code for TravelGroupr Registration';
  
  const text = `
    Hi ${username},
    
    Your one-time registration code for TravelGroupr is: ${otp}
    
    Please enter this code in the verification form that appeared when you registered.
    This code will expire in 10 minutes.
    
    IMPORTANT: This verification code is different from the verification link you will receive in a separate welcome email.
    
    If you didn't request this code, please ignore this email.
    
    Best regards,
    The TravelGroupr Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your TravelGroupr Registration Code</h2>
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