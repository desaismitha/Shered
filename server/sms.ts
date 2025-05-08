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
    
    // Use the Twilio phone number from environment variables (outgoing only)
    let senderNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!senderNumber) {
      console.error('TWILIO_PHONE_NUMBER environment variable is not set');
      return false;
    }
    
    // Make sure the sender number is properly formatted with +1 prefix
    senderNumber = formatPhoneNumber(senderNumber);
    
    // Log what we're using
    console.log(`Using Twilio number ${senderNumber} for sending SMS (outgoing only)`);
    
    // If we're trying to send to the same number as our Twilio number, we should fallback to email only
    if (formattedPhoneNumber === senderNumber) {
      console.warn(`SMS 'to' and 'from' numbers would match: ${formattedPhoneNumber}`);
      console.warn('Fallback to email verification only');
      return false;
    }
    
    // No need to check if numbers match since we're using an outgoing-only number
    
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
  const message = `Shered verification code: ${otp}. This code will expire in 10 minutes.`;
  
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
  console.log(`Formatting phone number: '${phoneNumber}'`);
  
  // Remove any non-digit characters (spaces, dashes, parentheses, etc.)
  const digits = phoneNumber.replace(/\D/g, '');
  console.log(`After removing non-digits: '${digits}'`);
  
  // If the number already starts with a +, return it as is
  if (phoneNumber.startsWith('+')) {
    console.log(`Number already has + prefix: '${phoneNumber}'`);
    return phoneNumber;
  }
  
  // If it's a US number (10 digits), add +1
  if (digits.length === 10) {
    const formatted = `+1${digits}`;
    console.log(`Formatted 10-digit number: '${formatted}'`);
    return formatted;
  }
  
  // For international numbers or numbers with country code included
  const formatted = `+${digits}`;
  console.log(`Formatted number: '${formatted}'`);
  return formatted;
}
