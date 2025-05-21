import React from 'react';
import { Plane, Car, Clock, Calendar, Users, MapPin, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { TrustLoopzLogo } from '@/components/ui/logo';

export default function IntroductionPage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-white relative">
      {/* Fixed top navigation bar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <TrustLoopzLogo className="h-8 w-8 mr-2" />
            <h1 className="text-2xl font-bold text-primary">TrustLoopz</h1>
          </div>
          <Link to="/auth">
            <Button className="bg-primary text-white hover:bg-primary/90">
              Login / Sign Up
            </Button>
          </Link>
        </div>
      </div>
      
      {/* Hero Section - adjusted padding to account for fixed nav */}
      <section className="bg-gradient-to-r from-primary-50 via-primary-100 to-primary-50 pt-28 pb-16 md:pb-24">
        <div className="container mx-auto px-4 md:px-6">
          
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="md:w-1/2 space-y-4">
              {/* Removed duplicate logo/button header from this section */}
              <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                Simplify your kids' transportation coordination
              </h2>
              <p className="text-xl text-gray-700 mt-4">
                The smart, reliable way to manage pick-ups and drop-offs for school, activities, and events.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link to="/auth">
                  <Button className="px-6 py-3 text-lg">
                    Get Started
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="outline" className="px-6 py-3 text-lg">
                    Learn More
                  </Button>
                </a>
              </div>
            </div>
            <div className="md:w-1/2 flex justify-center">
              <div className="relative w-full max-w-md">
                <div className="absolute -top-6 -left-6 w-24 h-24 bg-primary/20 rounded-full"></div>
                <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-primary/10 rounded-full"></div>
                <div className="bg-white rounded-xl shadow-xl p-6 relative z-10">
                  <div className="flex items-center gap-4 mb-4 border-b pb-4">
                    <Car className="text-primary h-12 w-12" />
                    <div>
                      <h3 className="font-bold text-lg">School Drop-off</h3>
                      <p className="text-gray-600">Today • 7:30 AM</p>
                    </div>
                    <CheckCircle className="ml-auto text-green-500 h-6 w-6" />
                  </div>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="text-gray-400 h-5 w-5 mt-0.5" />
                      <p className="text-gray-700">Home → Woodland Elementary</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Users className="text-gray-400 h-5 w-5 mt-0.5" />
                      <p className="text-gray-700">Emma, Michael</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Car className="text-gray-400 h-5 w-5 mt-0.5" />
                      <p className="text-gray-700">Driver: Jason (confirmed)</p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <Button className="w-full">View Details</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Challenge Section */}
      <section className="py-16" id="challenges">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">The Challenges of Transportation Coordination</h2>
            <p className="text-lg text-gray-600">
              Managing the logistics of kids' transportation can be overwhelming for families. Here's why:
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="bg-primary-100 p-3 rounded-full w-14 h-14 flex items-center justify-center mb-4">
                <Clock className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Scheduling Complexity</h3>
              <p className="text-gray-600">
                Balancing work schedules, school hours, and various activities creates logistical puzzles for parents and guardians.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="bg-primary-100 p-3 rounded-full w-14 h-14 flex items-center justify-center mb-4">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Communication Gaps</h3>
              <p className="text-gray-600">
                Coordinating with other parents, caregivers, and schools often leads to miscommunication and missed pickups.
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="bg-primary-100 p-3 rounded-full w-14 h-14 flex items-center justify-center mb-4">
                <Calendar className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2">Last-Minute Changes</h3>
              <p className="text-gray-600">
                Unexpected schedule changes, traffic issues, or sick children can disrupt carefully planned transportation arrangements.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Video Tutorial Section */}
      <section className="py-16 bg-white" id="video-tutorial">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">See TrustLoopz in Action</h2>
            <p className="text-lg text-gray-600">
              Watch this short video to learn how TrustLoopz makes transportation coordination simple and stress-free.
            </p>
          </div>
          <div className="max-w-3xl mx-auto rounded-xl overflow-hidden shadow-xl bg-white p-2">
            <div className="relative pb-[56.25%] h-0">
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg">
                <div className="text-center p-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium mb-2">Demo Video Coming Soon</h3>
                  <p className="text-gray-500 text-sm mb-4">Our tutorial video is being produced and will be available shortly.</p>
                  <Button variant="outline" className="bg-white">
                    Notify Me When Available
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Solution Section */}
      <section className="py-16 bg-gray-50" id="how-it-works">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How TrustLoopz Makes It Easy</h2>
            <p className="text-lg text-gray-600">
              Our platform simplifies transportation coordination with powerful yet easy-to-use features.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="bg-primary text-white rounded-full h-10 w-10 flex items-center justify-center shrink-0">1</div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Create Transportation Groups</h3>
                  <p className="text-gray-600">Form groups with other parents, guardians, or caretakers to share transportation responsibilities.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="bg-primary text-white rounded-full h-10 w-10 flex items-center justify-center shrink-0">2</div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Set Up Regular Schedules</h3>
                  <p className="text-gray-600">Create recurring pickup and drop-off schedules for school, activities, and events.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="bg-primary text-white rounded-full h-10 w-10 flex items-center justify-center shrink-0">3</div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Assign Drivers</h3>
                  <p className="text-gray-600">Designate drivers for specific days or trips with built-in confirmation system.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="bg-primary text-white rounded-full h-10 w-10 flex items-center justify-center shrink-0">4</div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Get Real-time Updates</h3>
                  <p className="text-gray-600">Receive notifications about trip status, route changes, and arrival/departure times.</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="space-y-4">
                <div className="bg-primary-50 p-4 rounded-lg">
                  <h4 className="font-bold text-lg mb-2">✓ Easy Schedule Management</h4>
                  <p className="text-gray-600">Create, edit, and visualize all your transportation schedules in one place.</p>
                </div>
                
                <div className="bg-primary-50 p-4 rounded-lg">
                  <h4 className="font-bold text-lg mb-2">✓ Real-time Tracking</h4>
                  <p className="text-gray-600">Know exactly where your children are during transportation with live location updates.</p>
                </div>
                
                <div className="bg-primary-50 p-4 rounded-lg">
                  <h4 className="font-bold text-lg mb-2">✓ Smart Notifications</h4>
                  <p className="text-gray-600">Automated reminders and alerts keep everyone informed and on schedule.</p>
                </div>
                
                <div className="bg-primary-50 p-4 rounded-lg">
                  <h4 className="font-bold text-lg mb-2">✓ Role-based Access</h4>
                  <p className="text-gray-600">Our powerful permission system lets you assign specific roles like Admin, Parent/Guardian, or Driver, each with appropriate access levels. Admins can create and edit all schedules, while others can request modifications when needed.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold mb-4">TrustLoopz Mobile and Watch Apps <span className="inline-block bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-full">Coming Soon</span></h2>
                <p className="text-lg text-gray-700 mb-6">
                  Take the power of TrustLoopz with you wherever you go. Our upcoming mobile app and watch app will make coordination even easier.
                </p>
                <div className="space-y-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary-100 p-2 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold">Real-time Location Updates</h3>
                      <p className="text-gray-600">Share your location in real-time with your transportation group.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-primary-100 p-2 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold">Smart Notifications</h3>
                      <p className="text-gray-600">Get timely alerts for pickups, drop-offs, and schedule changes.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="bg-primary-100 p-2 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold">Quick Check-ins</h3>
                      <p className="text-gray-600">Tap to check in for scheduled trips with automatic location verification.</p>
                    </div>
                  </div>
                </div>
                <Button className="mb-2 mr-2">
                  Notify Me When Available
                </Button>
                <p className="text-sm text-gray-500">Be the first to know when our mobile apps launch.</p>
              </div>
              <div className="order-first md:order-last">
                <div className="relative">
                  <div className="absolute -top-6 -right-6 w-32 h-32 bg-primary/10 rounded-full"></div>
                  <div className="bg-gray-100 rounded-xl p-8 relative z-10 text-center">
                    <div className="flex justify-center mb-6">
                      <div className="bg-white w-64 h-[500px] rounded-[32px] shadow-lg flex flex-col overflow-hidden border-4 border-gray-200 relative">
                        <div className="absolute w-32 h-6 bg-gray-800 rounded-b-xl top-0 left-1/2 transform -translate-x-1/2"></div>
                        <div className="p-3 flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white">
                          <div className="w-12 h-12 bg-primary rounded-full mb-3 flex items-center justify-center">
                            <Plane className="h-6 w-6 text-white" />
                          </div>
                          <h3 className="text-xl font-bold text-gray-800">TrustLoopz</h3>
                          <p className="text-gray-600 text-sm mb-4">Mobile App</p>
                          <div className="w-full p-3 bg-white rounded-lg shadow-md mb-3">
                            <div className="flex items-center">
                              <Car className="h-5 w-5 text-primary mr-2" />
                              <div className="text-left">
                                <p className="font-medium text-sm">School Pickup</p>
                                <p className="text-xs text-gray-500">3:15 PM - In Progress</p>
                              </div>
                            </div>
                          </div>
                          <div className="w-full p-3 bg-white rounded-lg shadow-md">
                            <div className="flex items-center">
                              <Calendar className="h-5 w-5 text-primary mr-2" />
                              <div className="text-left">
                                <p className="font-medium text-sm">Soccer Practice</p>
                                <p className="text-xs text-gray-500">5:00 PM - Upcoming</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-500">Mobile App Preview</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary-600 text-white">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to simplify your transportation coordination?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Join TrustLoopz today and spend less time managing logistics and more time with your family.
          </p>
          <Link href={user ? "/" : "/auth"}>
            <Button className="bg-white text-primary hover:bg-gray-100 px-8 py-4 text-lg">
              {user ? 'Go to Dashboard' : 'Get Started Now'}
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-100 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <TrustLoopzLogo className="h-6 w-6 mr-2" />
              <span className="text-lg font-bold text-primary">TrustLoopz</span>
            </div>
            <div className="text-gray-600 text-sm">
              © {new Date().getFullYear()} TrustLoopz. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}