import React from "react";
import { User } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  FileText, 
  UserCheck, 
  UserX, 
  Calendar, 
  MapPin,
  Plus, 
  Edit 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DriverLicenseForm } from "./driver-license-form";

interface DriverInfoProps {
  user: User;
  tripId: number;
  accessLevel: 'owner' | 'member';
}

export function DriverInfoSection({ user, tripId, accessLevel }: DriverInfoProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDriverDialog, setShowDriverDialog] = React.useState(false);
  
  const hasLicenseInfo = user.licenseNumber && user.licenseState && user.licenseExpiry;
  const licenseIsValid = hasLicenseInfo && new Date(user.licenseExpiry!) > new Date();
  
  // Toggle driver eligibility mutation
  const toggleEligibilityMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/users/${user.id}/license/toggle-eligibility`, {
        isEligibleDriver: !user.isEligibleDriver
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/members`] });
      
      toast({
        title: user.isEligibleDriver ? "Driver status removed" : "Driver eligibility added",
        description: user.isEligibleDriver 
          ? "You're no longer listed as an eligible driver for this trip." 
          : "You're now marked as an eligible driver for this trip.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleToggleEligibility = () => {
    toggleEligibilityMutation.mutate();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <FileText className="h-5 w-5 mr-2 text-primary" />
          Driver Information
        </CardTitle>
        <CardDescription>
          {hasLicenseInfo 
            ? "Your driver license information for this trip"
            : "Add your driver license information to be assigned as a driver"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasLicenseInfo ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm font-medium mb-1">License #:</p>
                <p className="text-sm">{user.licenseNumber}</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">State/Province:</p>
                <p className="text-sm flex items-center">
                  <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  {user.licenseState}
                </p>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-1">Expiration Date:</p>
              <p className="text-sm flex items-center">
                <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                {format(new Date(user.licenseExpiry!), "PPP")}
                {!licenseIsValid && (
                  <Badge variant="destructive" className="ml-2 text-xs">
                    Expired
                  </Badge>
                )}
              </p>
            </div>
            
            <div className="pt-2">
              <p className="text-sm font-medium mb-2">Driver Status:</p>
              <div className="flex items-center">
                {user.isEligibleDriver ? (
                  <>
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-200 flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5" />
                      Eligible Driver
                    </Badge>
                    {licenseIsValid && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleToggleEligibility}
                        disabled={toggleEligibilityMutation.isPending}
                        className="ml-2 h-7 text-xs"
                      >
                        Remove Status
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="text-muted-foreground flex items-center gap-1">
                      <UserX className="h-3.5 w-3.5" />
                      Not a driver
                    </Badge>
                    {licenseIsValid && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleToggleEligibility}
                        disabled={toggleEligibilityMutation.isPending}
                        className="ml-2 h-7 text-xs"
                      >
                        Mark as Driver
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <Dialog open={showDriverDialog} onOpenChange={setShowDriverDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="mt-3 w-full">
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Update License Information
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Driver License Information</DialogTitle>
                </DialogHeader>
                <DriverLicenseForm 
                  userId={user.id}
                  currentData={{
                    licenseNumber: user.licenseNumber || undefined,
                    licenseState: user.licenseState || undefined,
                    licenseExpiry: user.licenseExpiry ? new Date(user.licenseExpiry) : null,
                    isEligibleDriver: user.isEligibleDriver
                  }}
                  onSuccess={() => setShowDriverDialog(false)}
                  onCancel={() => setShowDriverDialog(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="text-center py-4">
            <Dialog open={showDriverDialog} onOpenChange={setShowDriverDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Add License Information
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Driver License Information</DialogTitle>
                </DialogHeader>
                <DriverLicenseForm 
                  userId={user.id}
                  onSuccess={() => setShowDriverDialog(false)}
                  onCancel={() => setShowDriverDialog(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}