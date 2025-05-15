import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { Child, InsertChild } from '@shared/schema';
import { useAuth } from '@/hooks/use-auth';

// Define the form schema
const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email').optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  userId: z.number(),
});

interface ChildFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: InsertChild) => void;
  child: Child | null;
  isSubmitting: boolean;
}

export default function ChildFormDialog({
  open,
  onOpenChange,
  onSubmit,
  child,
  isSubmitting
}: ChildFormDialogProps) {
  const { user } = useAuth();
  
  // Initialize the form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: child?.name || '',
      email: child?.email || '',
      phoneNumber: child?.phoneNumber || '',
      notes: child?.notes || '',
      userId: user?.id || 0,
    },
  });
  
  // Update form values when the child prop changes or dialog opens/closes
  React.useEffect(() => {
    // Reset form when dialog opens/closes
    if (child) {
      form.reset({
        name: child.name,
        email: child.email || '',
        phoneNumber: child.phoneNumber || '',
        notes: child.notes || '',
        userId: child.userId,
      });
    } else {
      form.reset({
        name: '',
        email: '',
        phoneNumber: '',
        notes: '',
        userId: user?.id || 0,
      });
    }
  }, [child, form, user, open]);
  
  // Handle form submission
  const handleSubmit = (data: z.infer<typeof formSchema>) => {
    onSubmit(data as InsertChild);
  };
  
  // Custom handler for dialog open/close
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Ensure form is reset when dialog closes
      setTimeout(() => {
        form.reset({
          name: '',
          email: '',
          phoneNumber: '',
          notes: '',
          userId: user?.id || 0,
        });
      }, 0);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{child ? `Edit ${child.name}'s Profile` : 'Add Child Profile'}</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Child's name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Child's email (optional)" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Child's phone number (optional)" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any important information about the child (optional)"
                      className="resize-none"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <input type="hidden" {...form.register('userId')} />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}