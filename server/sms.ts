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
    
    // Get the Twilio phone number from environment variable and ensure it's properly formatted
    // Remove all non-digit characters to clean up the phone number
    let twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
    const digits = twilioNumber.replace(/\D/g, ''); // Remove all non-digits including spaces
    
    // Build proper E.164 formatted number for Twilio
    let senderNumber = '';
    
    // For US 10-digit numbers
    if (digits.length === 10) {
      senderNumber = `+1${digits}`;
    }
    // For numbers that already include country code
    else if (digits.length > 10) {
      senderNumber = `+${digits}`;
    }
    // Default: just use the original number as-is if it has a + prefix
    else if (twilioNumber.startsWith('+')) {
      senderNumber = twilioNumber;
    }
    // Last resort: try to add +1 for US
    else {
      senderNumber = `+1${digits}`;
    }
    
    // Log what we're using after cleanup
    console.log(`Formatted Twilio number: ${senderNumber} (from ${process.env.TWILIO_PHONE_NUMBER})`);
    
    // If we're trying to send to the same number as our Twilio number, we should fallback to email only
    if (formattedPhoneNumber === senderNumber) {
      console.warn(`SMS 'to' and 'from' numbers would match: ${formattedPhoneNumber}`);
      console.warn('Fallback to email verification only');
      return false;
    }
    
    console.log(`Using Twilio number ${senderNumber} for sending SMS to ${formattedPhoneNumber}`);
    
    // No longer need to check if numbers match since we're always using the alternative number
    
    console.log(`Attempting to send SMS to ${formattedPhoneNumber} from ${senderNumber}`);
    
    await twilioClient.messages.create({
      to: formattedPhoneNumber,
      from: senderNumber,
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
