import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ChildrenList from '@/components/profile/children-list';
import { useAuth } from '@/hooks/use-auth';
import { Redirect } from 'wouter';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  
  // Redirect to login if not authenticated
  if (!isLoading && !user) {
    return <Redirect to="/auth" />;
  }
  
  if (isLoading) {
    return <div className="container mx-auto py-8">Loading...</div>;
  }
  
  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Your Profile</h1>
      
      <Tabs defaultValue="account" className="space-y-4">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
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
                    {user?.phoneVerified ? (
                      <span className="text-sm text-green-500">Verified</span>
                    ) : (
                      <span className="text-sm text-amber-500">Not verified</span>
                    )}
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
  );
}