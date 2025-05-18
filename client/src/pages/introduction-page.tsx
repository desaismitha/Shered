import React from 'react';
import { Plane, Car, Clock, Calendar, Users, MapPin, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';

export default function IntroductionPage() {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-50 via-primary-100 to-primary-50 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="md:w-1/2 space-y-4">
              <div className="flex items-center justify-between w-full mb-4">
                <div className="flex items-center">
                  <Plane className="h-8 w-8 text-primary mr-2" />
                  <h1 className="text-3xl font-bold text-primary">Shered</h1>
                </div>
                <Link href="/auth">
                  <Button variant="outline" className="bg-white hover:bg-gray-50">
                    Login / Sign Up
                  </Button>
                </Link>
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                Simplify your kids' transportation coordination
              </h2>
              <p className="text-xl text-gray-700 mt-4">
                The smart, reliable way to manage pick-ups and drop-offs for school, activities, and events.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="/auth">
                  <Button className="px-6 py-3 text-lg">Get Started</Button>
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

      {/* Solution Section */}
      <section className="py-16 bg-gray-50" id="how-it-works">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How Shered Makes It Easy</h2>
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

      {/* CTA Section */}
      <section className="py-16 bg-primary-600 text-white">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to simplify your transportation coordination?</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Join Shered today and spend less time managing logistics and more time with your family.
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
              <Plane className="h-6 w-6 text-primary mr-2" />
              <span className="text-lg font-bold text-primary">Shered</span>
            </div>
            <div className="text-gray-600 text-sm">
              © {new Date().getFullYear()} Shered. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}