import twilio from 'twilio';

if (!process.env.TWILIO_ACCOUNT_SID) {
  console.warn("TWILIO_ACCOUNT_SID environment variable is not set. SMS functionality will be disabled.");
}

if (!process.env.TWILIO_AUTH_TOKEN) {
  console.warn("TWILIO_AUTH_TOKEN environment variable is not set. SMS functionality will be disabled.");
}

if (!process.env.TWILIO_PHONE_NUMBER) {
  console.warn("TWILIO_PHONE_NUMBER environment variable is not set. SMS functionality will use a default phone number, which may cause errors.");
}

// Initialize Twilio client if credentials are available
let twilioClient: twilio.Twilio | null = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

export interface SmsParams {
  to: string;
  body: string;
}

/**
 * Sends an SMS message using Twilio
 * @param params Object containing 'to' phone number and message 'body'
 * @returns Promise<boolean> indicating if the SMS was sent successfully
 */
export async function sendSMS(params: SmsParams): Promise<boolean> {
  try {
    if (!twilioClient) {
      console.error('Twilio client is not initialized. Check your environment variables.');
      return false;
    }
    
    if (!params.to || !params.body) {
      console.error('SMS requires both to and body parameters');
      return false;
    }
    
    // Format phone number to ensure it has the + prefix
    const formattedPhoneNumber = formatPhoneNumber(params.to);
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
    
    // Check if the numbers match - Twilio doesn't allow sending to the same number
    if (formattedPhoneNumber === twilioNumber) {
      console.warn(`Cannot send SMS - 'to' and 'from' numbers match: ${formattedPhoneNumber}`);
      return false;
    }
    
    console.log(`Attempting to send SMS to ${formattedPhoneNumber}`);
    
    await twilioClient.messages.create({
      to: formattedPhoneNumber,
      from: twilioNumber,
      body: params.body
    });
    
    console.log(`SMS successfully sent to ${formattedPhoneNumber}`);
    return true;
  } catch (error) {
    console.error('Twilio SMS error:', error);
    return false;
  }
}

/**
 * Sends an OTP verification code via SMS
 * @param phoneNumber The recipient's phone number
 * @param username The recipient's username
 * @param otp The one-time password code
 * @returns Promise<boolean> indicating if the SMS was sent successfully
 */
export async function sendOTPVerificationSMS(
  phoneNumber: string,
  username: string,
  otp: string
): Promise<boolean> {
  const message = `TravelGroupr verification code: ${otp}. This code will expire in 10 minutes.`;
  
  return sendSMS({
    to: phoneNumber,
    body: message
  });
}

/**
 * Helper function to format phone numbers to E.164 format
 * @param phoneNumber Phone number to format
 * @returns Formatted phone number with + prefix
 */
export function formatPhoneNumber(phoneNumber: string): string {
  // Remove any non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // If the number already starts with a +, return it as is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  // If it's a US number (10 digits), add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // For international numbers, assume they just need a + prefix
  // This is a simplification; in a production app, you'd want more robust handling
  return `+${digits}`;
}
