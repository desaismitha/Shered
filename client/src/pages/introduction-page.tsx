import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Car, 
  Clock, 
  CalendarCheck, 
  Users, 
  MessageSquare, 
  Bell, 
  MapPin,
  ArrowRight
} from "lucide-react";

export default function IntroductionPage() {
  return (
    <AppShell>
      {/* Hero Section */}
      <div className="relative bg-gradient-to-r from-primary-600 to-primary-800 text-white">
        <div className="container max-w-6xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
              Simplify Your Family's Transportation Challenges
            </h1>
            <p className="text-xl max-w-xl">
              Coordinating kids' pick-ups and drop-offs shouldn't be complicated. 
              Shered helps you manage schedules, coordinate with other parents, and keep everyone safe.
            </p>
            <div className="mt-10">
              <Link href="/auth">
                <Button size="lg" className="px-8 py-6 text-lg rounded-lg mr-4">
                  Get Started <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/schedules">
                <Button variant="outline" size="lg" className="px-8 py-6 text-lg rounded-lg border-white text-white hover:bg-white hover:text-primary-800">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-full lg:w-1/2 h-1/3 lg:h-full opacity-10">
          <div className="w-full h-full bg-repeat-space" style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"white\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"1\" y=\"3\" width=\"15\" height=\"13\"></rect><polygon points=\"16 8 20 8 23 11 23 16 16 16 16 8\"></polygon><circle cx=\"5.5\" cy=\"18.5\" r=\"2.5\"></circle><circle cx=\"18.5\" cy=\"18.5\" r=\"2.5\"></circle></svg>')" }}></div>
        </div>
      </div>

      {/* Challenges Section */}
      <div className="py-16 bg-gray-50">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              The Daily Challenges Parents Face
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
              Managing children's transportation to school, sports, and activities 
              creates significant challenges for families everywhere.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="inline-flex items-center justify-center rounded-md bg-primary-50 p-3 text-primary-700 mb-4">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Scheduling Conflicts</h3>
              <p className="text-gray-600">
                Juggling work schedules, multiple pick-ups and drop-offs at different locations,
                and last-minute changes can create overwhelming logistical challenges.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="inline-flex items-center justify-center rounded-md bg-primary-50 p-3 text-primary-700 mb-4">
                <Car className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Coordination Complexity</h3>
              <p className="text-gray-600">
                Organizing with other parents for carpools, tracking who's responsible for 
                which days, and ensuring all parents have proper contact information.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="inline-flex items-center justify-center rounded-md bg-primary-50 p-3 text-primary-700 mb-4">
                <Bell className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Safety Concerns</h3>
              <p className="text-gray-600">
                Ensuring children are picked up by authorized adults, 
                knowing when they've been safely dropped off, and having visibility into their journey.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="inline-flex items-center justify-center rounded-md bg-primary-50 p-3 text-primary-700 mb-4">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Communication Gaps</h3>
              <p className="text-gray-600">
                Maintaining open lines of communication with schools, activity leaders, 
                and other parents about schedule changes or delays.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="inline-flex items-center justify-center rounded-md bg-primary-50 p-3 text-primary-700 mb-4">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Location Tracking</h3>
              <p className="text-gray-600">
                Knowing when drivers are on their way, monitoring for unexpected delays or route changes,
                and confirming arrivals at destinations.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="inline-flex items-center justify-center rounded-md bg-primary-50 p-3 text-primary-700 mb-4">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Schedule Management</h3>
              <p className="text-gray-600">
                Keeping track of changing seasonal activities, different schedules for each child, 
                and coordinating with family calendars.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Solution Section */}
      <div className="py-16">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-6">
                How Shered Makes Transportation Simpler
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Shered was designed specifically for families facing these transportation challenges,
                providing tools that bring organization, safety, and peace of mind to your daily routine.
              </p>
              
              <ul className="space-y-4">
                <li className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <CalendarCheck className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium text-gray-900">Unified Schedule Management</h4>
                    <p className="mt-1 text-gray-600">Create, share and manage recurring pick-up and drop-off schedules that everyone can access.</p>
                  </div>
                </li>
                
                <li className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium text-gray-900">Group Coordination</h4>
                    <p className="mt-1 text-gray-600">Easily form groups with other parents, assign drivers, and share responsibilities.</p>
                  </div>
                </li>
                
                <li className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium text-gray-900">Real-time Location Tracking</h4>
                    <p className="mt-1 text-gray-600">See where drivers are during transport and receive notifications upon arrival and departure.</p>
                  </div>
                </li>
                
                <li className="flex">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-primary-600" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium text-gray-900">Integrated Communication</h4>
                    <p className="mt-1 text-gray-600">Message group members directly within the app about changes or updates.</p>
                  </div>
                </li>
              </ul>

              <div className="mt-10">
                <Link href="/auth">
                  <Button className="px-6 py-3 rounded-md">
                    Start Organizing Your Schedules
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="mt-10 lg:mt-0 flex justify-center">
              <div className="relative w-full max-w-md">
                <div className="absolute inset-0 bg-gradient-to-r from-primary-200 to-primary-300 transform -rotate-6 rounded-2xl"></div>
                <div className="relative bg-white p-6 rounded-2xl shadow-lg">
                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">Morning School Drop-off</h3>
                    <div className="mt-2 flex justify-between items-center">
                      <div className="flex items-center text-sm text-gray-500">
                        <Clock className="mr-1 h-4 w-4" /> 
                        7:30 - 8:15 AM
                      </div>
                      <div className="text-sm font-medium text-primary-600">Mon, Wed, Fri</div>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                        <MapPin className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Pickup</p>
                        <p className="text-sm text-gray-500">20613, Northeast 38th Street</p>
                      </div>
                    </div>
                    
                    <div className="relative h-14 my-2">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                        <MapPin className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Dropoff</p>
                        <p className="text-sm text-gray-500">Madison Elementary School</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <Car className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">Driver</p>
                          <p className="text-sm text-gray-500">Sarah Johnson</p>
                        </div>
                      </div>
                      <div>
                        <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Confirmed
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary-700 text-white">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              Ready to simplify your family's transportation?
            </h2>
            <p className="text-lg opacity-90 max-w-2xl mx-auto mb-8">
              Join thousands of families who are using Shered to coordinate pick-ups and drop-offs,
              ensuring their children get where they need to be safely and on time.
            </p>
            <Link href="/auth">
              <Button size="lg" variant="outline" className="px-8 py-6 text-lg rounded-lg border-white text-white hover:bg-white hover:text-primary-700">
                Sign Up Now
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}