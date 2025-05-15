import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, PlusCircle, Pencil, Trash2, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Child, InsertChild } from '@shared/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChildFormDialog } from '@/components/profile';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from '@/hooks/use-auth';

export default function ChildrenList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [fileUploadChild, setFileUploadChild] = useState<Child | null>(null);
  
  // Fetch all children for current user
  const { data: children, isLoading, error } = useQuery<Child[]>({
    queryKey: ['/api/children'],
    refetchOnWindowFocus: false,
  });
  
  // Create child mutation
  const createChildMutation = useMutation({
    mutationFn: async (data: InsertChild) => {
      const res = await apiRequest('POST', '/api/children', data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/children'] });
      toast({
        title: "Child added successfully",
        description: "The child profile has been added to your account.",
      });
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add child",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Update child mutation
  const updateChildMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<InsertChild> }) => {
      const res = await apiRequest('PATCH', `/api/children/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/children'] });
      toast({
        title: "Child updated successfully",
        description: "The child profile has been updated.",
      });
      setFormOpen(false);
      setSelectedChild(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update child",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Delete child mutation
  const deleteChildMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/children/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/children'] });
      toast({
        title: "Child removed",
        description: "The child profile has been removed from your account.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove child",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Upload picture mutation
  const uploadPictureMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: number, formData: FormData }) => {
      const res = await fetch(`/api/children/${id}/picture`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to upload picture');
      }
      
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/children'] });
      toast({
        title: "Picture uploaded",
        description: "The profile picture has been updated.",
      });
      setFileUploadChild(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to upload picture",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Handle form submission
  const handleSubmit = (data: InsertChild) => {
    // Make sure to include the current user ID
    data.userId = user?.id as number;
    
    if (selectedChild) {
      // Update existing child
      updateChildMutation.mutate({ id: selectedChild.id, data });
    } else {
      // Create new child
      createChildMutation.mutate(data);
    }
  };
  
  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!fileUploadChild) return;
    
    const file = event.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('picture', file);
    
    uploadPictureMutation.mutate({ id: fileUploadChild.id, formData });
  };
  
  // Open the form dialog for adding a new child
  const handleAddChild = () => {
    // Ensure we clear any previously selected child
    setSelectedChild(null);
    // Use setTimeout to ensure state is updated before dialog opens
    setTimeout(() => {
      setFormOpen(true);
    }, 0);
  };
  
  // Open the form dialog for editing an existing child
  const handleEditChild = (child: Child) => {
    setSelectedChild(child);
    setFormOpen(true);
  };
  
  // Handle upload picture button click
  const handleUploadPicture = (child: Child) => {
    setFileUploadChild(child);
    
    // Use a hidden file input for the upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = handleFileUpload as any;
    fileInput.click();
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-destructive mb-4">Failed to load children profiles</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/children'] })}>
          Try Again
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Children Profiles</h2>
        <Button onClick={handleAddChild} variant="outline" className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" />
          <span>Add Child</span>
        </Button>
      </div>
      
      {children && children.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((child) => (
            <Card key={child.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle>{child.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleEditChild(child)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove child profile?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete {child.name}'s profile
                            from your account.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => deleteChildMutation.mutate(child.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            {deleteChildMutation.isPending ? 
                              <Loader2 className="h-4 w-4 animate-spin" /> : 
                              "Remove"
                            }
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-4 items-center">
                  <div className="relative group">
                    <Avatar className="h-16 w-16">
                      {child.pictureUrl ? (
                        <AvatarImage src={child.pictureUrl} alt={child.name} />
                      ) : (
                        <AvatarFallback>{child.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      )}
                    </Avatar>
                    <div 
                      className="absolute inset-0 bg-black/40 rounded-full hidden group-hover:flex items-center justify-center cursor-pointer"
                      onClick={() => handleUploadPicture(child)}
                    >
                      <Upload className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {child.email && (
                      <p className="text-sm text-muted-foreground">Email: {child.email}</p>
                    )}
                    {child.phoneNumber && (
                      <p className="text-sm text-muted-foreground">Phone: {child.phoneNumber}</p>
                    )}
                  </div>
                </div>
                {child.notes && (
                  <div className="mt-2">
                    <p className="text-sm">{child.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-6">
            <CardDescription className="text-center mb-4">
              You haven't added any children profiles yet. Add information about children who will travel with you.
            </CardDescription>
            <Button onClick={handleAddChild} variant="outline" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              <span>Add Child</span>
            </Button>
          </CardContent>
        </Card>
      )}
      
      {/* Child form dialog */}
      <ChildFormDialog 
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        child={selectedChild}
        isSubmitting={createChildMutation.isPending || updateChildMutation.isPending}
      />
    </div>
  );
}