import fetch from 'node-fetch';

async function updateTrips() {
  try {
    // First login to get a session
    const loginResponse = await fetch('http://localhost:5000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'sarang.smitha@gmail.com',
        password: 'password123'
      }),
      credentials: 'include'
    });
    
    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text());
      return;
    }
    
    // Now trigger the update
    const updateResponse = await fetch('http://localhost:5000/api/admin/trips/update-statuses', {
      method: 'POST',
      credentials: 'include'
    });
    
    const result = await updateResponse.json();
    console.log('Update result:', result);
  } catch (error) {
    console.error('Error updating trips:', error);
  }
}

updateTrips();
