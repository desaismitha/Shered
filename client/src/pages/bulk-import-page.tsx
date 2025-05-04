import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Upload, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function BulkImportPage() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'complete'>('upload');

  // Get user's groups
  const { data: groups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ["/api/groups"],
  });

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiRequest(
        'POST',
        '/api/groups/import/preview',
        undefined,
        { body: formData }
      );
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data.previewData);
      setImportStep('preview');
      toast({
        title: 'File uploaded',
        description: 'Preview your data before confirming the import.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Confirm import mutation
  const importMutation = useMutation({
    mutationFn: async (data: { groupId: number; members: any[] }) => {
      const res = await apiRequest(
        'POST',
        '/api/groups/import/confirm',
        data
      );
      return res.json();
    },
    onSuccess: (data) => {
      setImportStep('complete');
      toast({
        title: 'Import successful',
        description: `${data.importedCount} members have been added to the group.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select an Excel file to upload.',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    uploadMutation.mutate(formData);
  };

  const handleConfirmImport = () => {
    if (!selectedGroupId || !previewData) {
      toast({
        title: 'Missing information',
        description: 'Please select a group and ensure data is previewed.',
        variant: 'destructive',
      });
      return;
    }

    importMutation.mutate({
      groupId: parseInt(selectedGroupId),
      members: previewData
    });
  };

  const handleDownloadTemplate = () => {
    // In a real implementation, this would download an Excel template
    // Here we'll just show a toast for demonstration
    toast({
      title: 'Template downloaded',
      description: 'Excel template has been downloaded to your device.',
    });
    
    // This would normally be a request to an endpoint that returns the template file
    window.open('/api/groups/import/template', '_blank');
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSelectedGroupId('');
    setPreviewData(null);
    setImportStep('upload');
  };

  return (
    <AppShell>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">Bulk Import Members</h1>

        <div className="max-w-3xl mx-auto">
          {importStep === 'upload' && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Member Data</CardTitle>
                <CardDescription>
                  Import multiple members at once using an Excel spreadsheet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col space-y-2">
                  <Label htmlFor="group">Select Group</Label>
                  {isLoadingGroups ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select 
                      value={selectedGroupId} 
                      onValueChange={setSelectedGroupId}
                    >
                      <SelectTrigger id="group">
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups && groups.map((group: any) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex flex-col space-y-2">
                  <Label htmlFor="file">Upload Excel File</Label>
                  <div className="border border-dashed border-neutral-300 rounded-md p-6 text-center">
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
                    <p className="text-sm text-neutral-600 mb-4">
                      Drag and drop your Excel file here, or click to browse
                    </p>
                    <Input
                      id="file"
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button 
                        variant="outline" 
                        onClick={() => document.getElementById('file')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Browse Files
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={handleDownloadTemplate}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                    {selectedFile && (
                      <div className="mt-4 text-sm text-neutral-600">
                        Selected: {selectedFile.name}
                      </div>
                    )}
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Excel File Format</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">Your Excel file should have the following columns:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>email</strong> - Member's email address (required)</li>
                      <li><strong>displayName</strong> - Member's display name</li>
                      <li><strong>phoneNumber</strong> - Member's phone number</li>
                      <li><strong>role</strong> - Member's role (admin or member)</li>
                      <li><strong>licenseNumber</strong> - Driver's license number</li>
                      <li><strong>licenseState</strong> - State/province of license</li>
                      <li><strong>licenseExpiry</strong> - License expiry date (YYYY-MM-DD)</li>
                      <li><strong>isEligibleDriver</strong> - Whether they can drive (true/false)</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  disabled={!selectedFile || !selectedGroupId || uploadMutation.isPending}
                  onClick={handleUpload}
                >
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload and Preview'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {importStep === 'preview' && previewData && (
            <Card>
              <CardHeader>
                <CardTitle>Preview Member Data</CardTitle>
                <CardDescription>
                  Review the data before importing. {previewData.length} members found.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-neutral-50">
                        <th className="px-4 py-2 text-left font-medium">Email</th>
                        <th className="px-4 py-2 text-left font-medium">Name</th>
                        <th className="px-4 py-2 text-left font-medium">Phone</th>
                        <th className="px-4 py-2 text-left font-medium">Role</th>
                        <th className="px-4 py-2 text-left font-medium">Driver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.slice(0, 10).map((member, index) => (
                        <tr key={index} className="border-b">
                          <td className="px-4 py-2">{member.email}</td>
                          <td className="px-4 py-2">{member.displayName}</td>
                          <td className="px-4 py-2">{member.phoneNumber}</td>
                          <td className="px-4 py-2">{member.role || 'member'}</td>
                          <td className="px-4 py-2">{member.isEligibleDriver ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                      {previewData.length > 10 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-2 text-center text-neutral-500">
                            ... and {previewData.length - 10} more members
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end space-x-2">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmImport}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? 'Importing...' : 'Confirm Import'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {importStep === 'complete' && (
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                  <CardTitle>Import Completed</CardTitle>
                </div>
                <CardDescription>
                  Your member data has been successfully imported.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Success!</AlertTitle>
                  <AlertDescription className="text-green-700">
                    Members have been added to your group. They will receive invitations to join.
                  </AlertDescription>
                </Alert>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleReset}>
                  Import More Members
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
