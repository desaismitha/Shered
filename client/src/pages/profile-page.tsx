import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, CheckIcon, SaveIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

import ChildrenList from '@/components/profile/children-list';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';
import { AppShell } from '@/components/layout/app-shell';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  
  // State for driving details form
  const [licenseNumber, setLicenseNumber] = useState(user?.licenseNumber || '');
  const [licenseState, setLicenseState] = useState(user?.licenseState || '');
  const [licenseExpiry, setLicenseExpiry] = useState<Date | undefined>(
    user?.licenseExpiry ? new Date(user.licenseExpiry) : undefined
  );
  const [isEligibleDriver, setIsEligibleDriver] = useState(user?.isEligibleDriver || false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Mutation to update driving details
  const updateDrivingDetailsMutation = useMutation({
    mutationFn: async (drivingDetails: {
      licenseNumber: string;
      licenseState: string;
      licenseExpiry: Date | null;
      isEligibleDriver: boolean;
    }) => {
      const res = await apiRequest('PATCH', '/api/user/driving-details', drivingDetails);
      if (!res.ok) throw new Error('Failed to update driving details');
      return await res.json();
    },
    onSuccess: (data) => {
      // Update the user data in the cache
      queryClient.setQueryData(['/api/user'], (oldData: any) => {
        return { ...oldData, ...data };
      });
      
      toast({
        title: 'Driving details updated',
        description: 'Your driving information has been saved successfully.',
        variant: 'default',
      });
      
      setIsSaving(false);
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error.message || 'Failed to update driving details. Please try again.',
        variant: 'destructive',
      });
      
      setIsSaving(false);
    }
  });
  
  // Handle form submission
  const handleSaveDrivingDetails = () => {
    setIsSaving(true);
    updateDrivingDetailsMutation.mutate({
      licenseNumber,
      licenseState,
      licenseExpiry: licenseExpiry || null,
      isEligibleDriver
    });
  };
  
  // Redirect to login if not authenticated
  if (!isLoading && !user) {
    return <Redirect to="/auth" />;
  }
  
  if (isLoading) {
    return (
      <AppShell>
        <div className="container mx-auto py-8">
          <div className="flex justify-center items-center min-h-[50vh]">
            <p className="text-neutral-500">Loading profile information...</p>
          </div>
        </div>
      </AppShell>
    );
  }
  
  return (
    <AppShell>
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">Your Profile</h1>
        
        <Tabs defaultValue="account" className="space-y-4">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="driving">Driving Details</TabsTrigger>
            <TabsTrigger value="children">Children</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>
          
          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  View and manage your personal account details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <span className="font-medium min-w-32">Username:</span>
                    <span>{user?.username}</span>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <span className="font-medium min-w-32">Email:</span>
                    <span>{user?.email}</span>
                    {user?.emailVerified ? (
                      <span className="text-sm text-green-500">Verified</span>
                    ) : (
                      <span className="text-sm text-amber-500">Not verified</span>
                    )}
                  </div>
                  {user?.displayName && (
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                      <span className="font-medium min-w-32">Display Name:</span>
                      <span>{user.displayName}</span>
                    </div>
                  )}
                  {user?.phoneNumber && (
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                      <span className="font-medium min-w-32">Phone Number:</span>
                      <span>{user.phoneNumber}</span>
                    </div>
                  )}
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                    <span className="font-medium min-w-32">Account Created:</span>
                    <span>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="driving" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Driving Details</CardTitle>
                <CardDescription>
                  Add your driver's license information and eligibility status
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="licenseNumber">License Number</Label>
                      <Input 
                        id="licenseNumber" 
                        placeholder="Enter your driver's license number" 
                        value={licenseNumber || ''}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="licenseState">License State/Province</Label>
                      <Input 
                        id="licenseState" 
                        placeholder="e.g. CA, NY, WA" 
                        value={licenseState || ''}
                        onChange={(e) => setLicenseState(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="licenseExpiry">License Expiry Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          id="licenseExpiry"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {licenseExpiry ? (
                            format(licenseExpiry, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={licenseExpiry}
                          onSelect={setLicenseExpiry}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="eligible-driver"
                      checked={isEligibleDriver}
                      onCheckedChange={setIsEligibleDriver}
                    />
                    <Label htmlFor="eligible-driver">I am eligible to drive for group trips</Label>
                  </div>
                  
                  <div className="pt-4">
                    <Button 
                      onClick={handleSaveDrivingDetails} 
                      disabled={isSaving || updateDrivingDetailsMutation.isPending}
                      className="w-full md:w-auto"
                    >
                      {isSaving || updateDrivingDetailsMutation.isPending ? (
                        <>
                          <span className="mr-2">Saving...</span>
                          <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"></div>
                        </>
                      ) : (
                        <>
                          <SaveIcon className="mr-2 h-4 w-4" />
                          Save Driving Details
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="children">
            <ChildrenList />
          </TabsContent>
          
          <TabsContent value="preferences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Configure how you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Notification preferences will be available in a future update.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}