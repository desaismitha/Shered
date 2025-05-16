import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ModificationRequest {
  id: number;
  tripId: number;
  requestedBy: number;
  status: string;
  requestData: Record<string, any>;
  adminNotes: string | null;
  reviewedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

interface RequestUser {
  id: number;
  displayName: string;
  username: string;
}

interface ModificationRequestsTabProps {
  tripId: number;
  tripName: string;
}

export function ModificationRequestsTab({ tripId, tripName }: ModificationRequestsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adminNotes, setAdminNotes] = useState<string>("");
  
  // Fetch modification requests for this trip
  const { data: requests, isLoading, error } = useQuery<ModificationRequest[]>({
    queryKey: ["/api/trips", tripId, "modification-requests"],
    queryFn: async () => {
      const res = await fetch(`/api/trips/${tripId}/modification-requests`);
      if (!res.ok) {
        throw new Error("Failed to load modification requests");
      }
      return res.json();
    },
  });
  
  // Fetch users for displaying who requested the modifications
  const { data: users } = useQuery<RequestUser[]>({
    queryKey: ["/api/users"],
    enabled: !!requests && requests.length > 0,
  });
  
  // Mutation for approving a request
  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await apiRequest(
        "POST", 
        `/api/modification-requests/${requestId}/approve`,
        { adminNotes }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "modification-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({
        title: "Request approved",
        description: "The schedule has been updated with the requested changes.",
        variant: "default",
      });
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to approve request",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Mutation for rejecting a request
  const rejectMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const res = await apiRequest(
        "POST", 
        `/api/modification-requests/${requestId}/reject`,
        { adminNotes }
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "modification-requests"] });
      toast({
        title: "Request rejected",
        description: "The modification request has been rejected.",
        variant: "default",
      });
      setAdminNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reject request",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Function to handle review actions
  const handleReviewClick = (request: ModificationRequest, action: "approve" | "reject") => {
    if (action === "approve") {
      approveMutation.mutate(request.id);
    } else {
      rejectMutation.mutate(request.id);
    }
  };
  
  // Helper to get user display name
  const getUserName = (userId: number): string => {
    if (!users) return "Unknown user";
    const user = users.find(u => u.id === userId);
    return user ? (user.displayName || user.username) : "Unknown user";
  };
  
  // Helper to format the requested changes for display
  const formatRequestData = (data: Record<string, any>): React.ReactNode => {
    const changes = [];
    
    for (const [key, value] of Object.entries(data)) {
      let formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
      formattedKey = formattedKey.charAt(0).toUpperCase() + formattedKey.slice(1);
      
      // Handle different types of values
      let displayValue: string;
      if (key === 'startDate' || key === 'endDate') {
        displayValue = new Date(value as string).toLocaleString();
      } else if (typeof value === 'boolean') {
        displayValue = value ? 'Yes' : 'No';
      } else if (value === null) {
        displayValue = 'None';
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value);
      } else {
        displayValue = String(value);
      }
      
      changes.push(
        <li key={key} className="mb-1">
          <span className="font-medium">{formattedKey}:</span> {displayValue}
        </li>
      );
    }
    
    return <ul className="list-disc pl-5">{changes}</ul>;
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading modification requests...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>
            There was a problem loading the modification requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{(error as Error).message}</p>
          <Button 
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "modification-requests"] })}
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  if (!requests || requests.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Modification Requests</CardTitle>
          <CardDescription>
            There are no modification requests for this schedule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            When members of your group request changes to this schedule, they will appear here for your review.
          </p>
        </CardContent>
      </Card>
    );
  }
  
  const pendingRequests = requests.filter(req => req.status === 'pending');
  const reviewedRequests = requests.filter(req => req.status !== 'pending');
  
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Modification Requests for {tripName}</CardTitle>
          <CardDescription>
            Review and approve or reject requested changes to this schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {pendingRequests.length > 0 ? (
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Requested Changes</TableHead>
                    <TableHead>Date Requested</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map(request => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {getUserName(request.requestedBy)}
                      </TableCell>
                      <TableCell>
                        {formatRequestData(request.requestData)}
                      </TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleReviewClick(request, "approve")}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleReviewClick(request, "reject")}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                          
                          <Textarea
                            placeholder="Add notes for the requester (optional)"
                            className="h-20 text-sm"
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-6">
              <p className="text-center text-muted-foreground">No pending requests</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {reviewedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Previous Requests</CardTitle>
            <CardDescription>
              Previously reviewed modification requests
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested Changes</TableHead>
                    <TableHead>Admin Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewedRequests.map(request => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {getUserName(request.requestedBy)}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          request.status === 'approved' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }>
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatRequestData(request.requestData)}
                      </TableCell>
                      <TableCell>
                        {request.adminNotes || "No notes provided"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      
      {(approveMutation.isPending || rejectMutation.isPending) && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg flex items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span>Processing request...</span>
          </div>
        </div>
      )}
    </div>
  );
}