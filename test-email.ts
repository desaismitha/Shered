// Testing email functionality directly
import { MailService } from '@sendgrid/mail';

// Add more detailed logging
console.log('ENVIRONMENT VARIABLES:');
console.log('SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? `${process.env.SENDGRID_API_KEY.substring(0, 5)}...` : 'not set');
console.log('SENDGRID_VERIFIED_SENDER:', process.env.SENDGRID_VERIFIED_SENDER);

const sendgridApiKey = process.env.SENDGRID_API_KEY;
const verifiedSender = process.env.SENDGRID_VERIFIED_SENDER;

if (!sendgridApiKey) {
  console.error('SendGrid API key is not configured');
  process.exit(1);
}

if (!verifiedSender) {
  console.error('SendGrid verified sender is not configured');
  process.exit(1);
}

async function testEmail() {
  try {
    console.log('SendGrid API key length:', sendgridApiKey.length);
    console.log('Using verified sender:', verifiedSender);
    
    const mailService = new MailService();
    mailService.setApiKey(sendgridApiKey);
    
    const msg = {
      to: 'sarang.smitha@gmail.com', // Change this to your email address
      from: verifiedSender,
      subject: 'Test Email from TravelGroupr',
      text: 'This is a test email from the TravelGroupr application.',
      html: '<strong>This is a test email from the TravelGroupr application.</strong>',
    };
    
    console.log('Sending test email to:', msg.to);
    const response = await mailService.send(msg);
    console.log('Email sent successfully!', response);
    return { success: true, response };
  } catch (error: any) {
    console.error('Error sending email:', error);
    if (error.response) {
      console.error('Error details:', error.response.body);
    }
    return { success: false, error: error.message };
  }
}

testEmail()
  .then(result => {
    console.log('Test completed with result:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error in test:', err);
    process.exit(1);
  });