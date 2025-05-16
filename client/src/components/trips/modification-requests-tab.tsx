import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

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
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Admin";
  const [selectedRequest, setSelectedRequest] = useState<ModificationRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);

  // Fetch users to display names
  const { data: users = [] } = useQuery<RequestUser[]>({
    queryKey: ["/api/users"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch modification requests for this trip
  const { data: requests = [], isLoading } = useQuery<ModificationRequest[]>({
    queryKey: [`/api/trips/${tripId}/modification-requests`],
    staleTime: 30 * 1000, // 30 seconds
  });

  // Approve request mutation
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, notes }: { requestId: number; notes: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/modification-requests/${requestId}/approve`,
        { notes }
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Approved",
        description: "The modification request has been approved and applied.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/modification-requests`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] });
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve the modification request.",
        variant: "destructive",
      });
    },
  });

  // Reject request mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ requestId, notes }: { requestId: number; notes: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/modification-requests/${requestId}/reject`,
        { notes }
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Rejected",
        description: "The modification request has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/modification-requests`] });
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject the modification request.",
        variant: "destructive",
      });
    },
  });

  // Helper function to get a user's name by ID
  const getUserName = (userId: number): string => {
    const user = users.find(u => u.id === userId);
    return user ? user.displayName : `User #${userId}`;
  };

  // Handle review button click
  const handleReviewClick = (request: ModificationRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  // Handle review submission
  const handleReviewSubmit = () => {
    if (!selectedRequest || !reviewAction) return;

    if (reviewAction === "approve") {
      approveMutation.mutate({
        requestId: selectedRequest.id,
        notes: reviewNotes,
      });
    } else {
      rejectMutation.mutate({
        requestId: selectedRequest.id,
        notes: reviewNotes,
      });
    }
  };

  // Filter requests based on status
  const pendingRequests = requests.filter(req => req.status === "pending");
  const approvedRequests = requests.filter(req => req.status === "approved");
  const rejectedRequests = requests.filter(req => req.status === "rejected");

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium">No modification requests</h3>
        <p className="text-gray-500 mt-2">
          There are no modification requests for this schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="pending">
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approvedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({rejectedRequests.length})
          </TabsTrigger>
        </TabsList>

        {["pending", "approved", "rejected"].map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="space-y-4">
            {requests
              .filter(req => req.status === tabValue)
              .map(request => (
                <Card key={request.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          Request #{request.id}
                        </CardTitle>
                        <CardDescription>
                          From {getUserName(request.requestedBy)} on{" "}
                          {new Date(request.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Badge
                        className={
                          request.status === "pending"
                            ? "bg-yellow-500"
                            : request.status === "approved"
                            ? "bg-green-500"
                            : "bg-red-500"
                        }
                      >
                        {request.status.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <h4 className="font-medium">Requested Changes:</h4>
                      <div className="border rounded-md p-3 bg-gray-50">
                        {Object.entries(request.requestData).length > 0 ? (
                          <ul className="space-y-2">
                            {Object.entries(request.requestData).map(([key, value]) => (
                              <li key={key} className="text-sm">
                                <span className="font-medium capitalize">{key}:</span>{" "}
                                {typeof value === "string" && 
                                  (key.toLowerCase().includes("date") 
                                    ? new Date(value).toLocaleString() 
                                    : value)
                                }
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500">No specific changes requested.</p>
                        )}
                      </div>

                      {request.adminNotes && (
                        <div>
                          <h4 className="font-medium">Notes:</h4>
                          <p className="text-sm mt-1">{request.adminNotes}</p>
                        </div>
                      )}

                      {request.reviewedBy && (
                        <div className="text-sm text-gray-500">
                          Reviewed by {getUserName(request.reviewedBy)} on{" "}
                          {new Date(request.updatedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </CardContent>

                  {isAdmin && request.status === "pending" && (
                    <CardFooter className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => handleReviewClick(request, "reject")}
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleReviewClick(request, "approve")}
                      >
                        Approve
                      </Button>
                    </CardFooter>
                  )}
                </Card>
              ))}

            {requests.filter(req => req.status === tabValue).length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  No {tabValue} requests found.
                </p>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Approve" : "Reject"} Modification Request
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve"
                ? "Are you sure you want to approve this request? The changes will be applied to the schedule."
                : "Are you sure you want to reject this request?"}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Notes (Optional)
            </label>
            <Textarea
              placeholder="Add any notes about your decision"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={approveMutation.isPending || rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReviewSubmit}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              variant={reviewAction === "approve" ? "default" : "destructive"}
            >
              {approveMutation.isPending || rejectMutation.isPending
                ? "Processing..."
                : reviewAction === "approve"
                ? "Approve"
                : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}