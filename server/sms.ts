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
    
    // Use a different Twilio phone number if the user's phone number would match
    // For development/testing, we use a secondary phone number to avoid Twilio restrictions
    // When USER_PHONE matches TWILIO_PHONE_NUMBER, we need an alternative sender
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';
    const alternativeNumber = "+14258353425"; // Alternative Twilio number (425) 835-3425
    
    // Determine which sender number to use
    let senderNumber = twilioNumber;
    
    // Check if the numbers match - Twilio doesn't allow sending to the same number
    if (formattedPhoneNumber === twilioNumber) {
      console.warn(`SMS 'to' and 'from' numbers would match: ${formattedPhoneNumber}`);
      
      // Use the Twilio alternative phone number if available, otherwise return false
      if (alternativeNumber) {
        console.log(`Using alternative Twilio number for sending SMS to ${formattedPhoneNumber}`);
        senderNumber = alternativeNumber;
      } else {
        // If there's no valid alternative phone number, fallback to email only
        console.warn(`No alternative Twilio number available. SMS verification skipped for ${formattedPhoneNumber}`);
        return false;
      }
    }
    
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
