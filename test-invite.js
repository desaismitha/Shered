// Test script for group invitations
const fetch = require('node-fetch');

async function testInviteEmails() {
  const baseUrl = 'http://localhost:5000';
  
  console.log('-------------------------------------');
  console.log('GROUP INVITATION EMAIL TESTING SCRIPT');
  console.log('-------------------------------------');
  
  // Test 1: Send invitation to a new user
  console.log('\n📨 TEST 1: Sending invitation to new user...');
  try {
    const newUserRes = await fetch(`${baseUrl}/api/debug/email/invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test-new-user@example.com',
        groupName: 'Adventure Squad',
        inviterName: 'Test Admin',
        isExistingUser: false
      })
    });
    
    const newUserData = await newUserRes.json();
    console.log('✅ New user invitation result:', newUserData);
  } catch (error) {
    console.error('❌ Error sending new user invitation:', error);
  }
  
  // Wait before sending the next email
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Send invitation to an existing user
  console.log('\n📨 TEST 2: Sending invitation to existing user...');
  try {
    const existingUserRes = await fetch(`${baseUrl}/api/debug/email/invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test-existing-user@example.com',
        groupName: 'Adventure Squad',
        inviterName: 'Test Admin',
        isExistingUser: true
      })
    });
    
    const existingUserData = await existingUserRes.json();
    console.log('✅ Existing user invitation result:', existingUserData);
  } catch (error) {
    console.error('❌ Error sending existing user invitation:', error);
  }
  
  // Wait before sending the next email
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Send a generic test email for comparison
  console.log('\n📨 TEST 3: Sending basic test email for comparison...');
  try {
    const testEmailRes = await fetch(`${baseUrl}/api/debug/test-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test-generic@example.com',
        subject: 'TravelGroupr Test Email',
        message: 'This is a test email from TravelGroupr to verify email delivery is working correctly.'
      })
    });
    
    const testEmailData = await testEmailRes.json();
    console.log('✅ Basic test email result:', testEmailData);
  } catch (error) {
    console.error('❌ Error sending basic test email:', error);
  }
  
  console.log('\n-------------------------------------');
  console.log('TESTING COMPLETE');
  console.log('-------------------------------------');
}

// Run the tests
testInviteEmails().catch(console.error);
