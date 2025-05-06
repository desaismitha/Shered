// Test script to simulate a route deviation
const tripId = 37;  // The active trip we saw in the logs

// These coordinates are intentionally far from the route between
// the start location (47.643210, -122.062622) and 
// the destination (47.639104, -122.066813)
// This location is about 5km away from the route
const testLocation = {
  latitude: 47.683210,  // Significantly north of the route
  longitude: -122.102622 // Significantly east of the route
};

// Function to simulate a route deviation
async function simulateDeviation() {
  try {
    console.log('Simulating route deviation for trip ID:', tripId);
    console.log('Using test coordinates:', testLocation);
    
    const response = await fetch(`/api/trips/${tripId}/update-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testLocation)
    });
    
    const result = await response.json();
    console.log('Response from server:', result);
    
    if (result.routeStatus && !result.routeStatus.isOnRoute) {
      console.log('DEVIATION DETECTED!');
      console.log(`Distance from route: ${result.routeStatus.distanceFromRoute.toFixed(2)}km`);
      console.log('Email notification should have been sent to the trip creator');
    } else {
      console.log('No deviation detected or unexpected response');
    }
  } catch (error) {
    console.error('Error simulating deviation:', error);
  }
}

// Execute the test
simulateDeviation();
