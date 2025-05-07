const sgMail = require('@sendgrid/mail');

// Get the API key from environment variable
const sendgridApiKey = process.env.SENDGRID_API_KEY;
const verifiedSender = process.env.SENDGRID_VERIFIED_SENDER;

// Function to test email sending
async function testEmail() {
  console.log('Starting email test...');
  
  // Check if API key is available
  if (!sendgridApiKey) {
    console.error('SendGrid API key not found in environment variables');
    return false;
  }
  
  console.log(`SendGrid API key found (length: ${sendgridApiKey.length})`);
  
  // Set the API key
  sgMail.setApiKey(sendgridApiKey);
  
  console.log('API key set successfully');
  
  // Test email content
  const msg = {
    to: 'YOUR_EMAIL_HERE', // REPLACE WITH YOUR EMAIL TO TEST
    from: verifiedSender || 'noreply@travelgroupr.com',
    subject: 'TravelGroupr Email Test',
    text: 'This is a test email from TravelGroupr',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: #4a6ee0;">TravelGroupr Email Test</h2>
        <p>This is a test email from TravelGroupr sent at ${new Date().toISOString()}</p>
        <p>If you're receiving this email, it means your email configuration is working correctly!</p>
        <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
          <p style="margin: 0; font-size: 12px; color: #666;">
            This is an automated message from TravelGroupr. Please do not reply to this email.
          </p>
        </div>
      </div>
    `
  };
  
  try {
    // Send the email
    console.log(`Attempting to send test email to ${msg.to} from ${msg.from}...`);
    const response = await sgMail.send(msg);
    
    // Check the response
    console.log('Email sent successfully!');
    console.log('Response:', response);
    return true;
  } catch (error) {
    console.error('Error sending email:');
    console.error(error);
    
    // Log more detailed error information
    if (error.response) {
      console.error('Error response body:', error.response.body);
    }
    
    return false;
  }
}

// Run the test
testEmail()
  .then(success => {
    console.log(`Email test ${success ? 'completed successfully' : 'failed'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
    process.exit(1);
  });