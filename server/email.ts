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
    
    await mailService.send({
      to: params.to,
      from: (params.from || process.env.SENDGRID_VERIFIED_SENDER || '') as string,
      subject: params.subject,
      text: (params.text || '') as string,
      html: (params.html || '') as string,
    });
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
  inviteLink: string
): Promise<boolean> {
  const fromEmail = process.env.SENDGRID_VERIFIED_SENDER || 'noreply@travelgroupr.com';
  const subject = `You've been invited to join ${groupName} on TravelGroupr`;
  
  const text = `
    Hi there!
    
    ${inviterName} has invited you to join their travel group "${groupName}" on TravelGroupr.
    
    To accept the invitation and create your account, please visit:
    ${inviteLink}
    
    Happy travels!
    The TravelGroupr Team
  `;
  
  const html = `
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
  const subject = 'Verify Your Email for TravelGroupr';
  
  const text = `
    Hi ${username},
    
    Thank you for signing up with TravelGroupr!
    
    To verify your email address, please click the link below:
    ${verificationLink}
    
    This link will expire in 24 hours.
    
    If you didn't create an account, you can safely ignore this email.
    
    Best regards,
    The TravelGroupr Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to TravelGroupr!</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Thank you for signing up with TravelGroupr. To complete your registration, please verify your email address.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Verify Email Address
        </a>
      </div>
      <p>This link will expire in 24 hours.</p>
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
  const subject = 'Your Verification Code for TravelGroupr';
  
  const text = `
    Hi ${username},
    
    Your verification code for TravelGroupr is: ${otp}
    
    This code will expire in 10 minutes.
    
    If you didn't request this code, please ignore this email.
    
    Best regards,
    The TravelGroupr Team
  `;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Your TravelGroupr Verification Code</h2>
      <p>Hi <strong>${username}</strong>,</p>
      <p>Your verification code for TravelGroupr is:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="font-size: 24px; letter-spacing: 5px; font-weight: bold; background-color: #f5f5f5; padding: 15px; border-radius: 4px;">
          ${otp}
        </div>
      </div>
      <p>This code will expire in 10 minutes.</p>
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