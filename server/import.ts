import { read, utils } from 'xlsx';
import type { Express, Request, Response } from 'express';
import { storage } from './storage';
import { hashPassword } from './auth';
import { sendGroupInvitation } from './email';
import * as schema from '@shared/schema';
import { db } from './db';

// Define type for member data from Excel
interface ImportMemberData {
  email: string;
  displayName?: string;
  phoneNumber?: string;
  role?: string;
  licenseNumber?: string;
  licenseState?: string;
  licenseExpiry?: string;
  isEligibleDriver?: boolean;
}

// Define functions for handling import
export function setupImportRoutes(app: Express) {
  // Endpoint to preview imported data
  app.post('/api/groups/import/preview', async (req: any, res: Response) => {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const fileData = req.files.file.data;
      const workbook = read(fileData, { type: 'buffer' });
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = utils.sheet_to_json<ImportMemberData>(worksheet);
      
      // Validate data
      const validatedData = validateImportData(jsonData);
      
      return res.json({
        previewData: validatedData,
        totalCount: validatedData.length
      });
    } catch (error) {
      console.error('Error processing Excel file:', error);
      return res.status(500).json({ error: 'Failed to process Excel file' });
    }
  });

  // Endpoint to confirm import
  app.post('/api/groups/import/confirm', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { groupId, members } = req.body;
    console.log('Import request received:', { groupId, memberCount: members?.length });
    
    if (!groupId || !members || !Array.isArray(members)) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    try {
      // Check if user has access to the group
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Verify user is an admin of the group
      const groupMembers = await storage.getGroupMembers(groupId);
      const userMember = groupMembers.find(member => member.userId === req.user!.id);
      
      if (!userMember || userMember.role !== 'admin') {
        return res.status(403).json({ error: 'You must be a group admin to import members' });
      }

      console.log('Starting import process for group:', { groupId, groupName: group.name, memberCount: members.length });
      
      // Process member imports
      const importResults = await processMemberImports(groupId, members, req.user!.id);
      
      console.log('Import completed with results:', importResults);
      
      return res.json({
        success: true,
        importedCount: importResults.successCount,
        errorCount: importResults.errorCount,
        errors: importResults.errors
      });
    } catch (error) {
      console.error('Error importing members:', error);
      return res.status(500).json({ error: 'Failed to import members' });
    }
  });

  // Endpoint to download template
  app.get('/api/groups/import/template', (req: Request, res: Response) => {
    // Simplified template as JSON for now
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=travelgroupr_member_import_template.json');
    
    res.json([
      {
        email: 'member1@example.com',
        displayName: 'Member One',
        phoneNumber: '123-456-7890',
        role: 'member',
        licenseNumber: 'DL123456',
        licenseState: 'CA',
        licenseExpiry: '2025-12-31',
        isEligibleDriver: true
      },
      {
        email: 'member2@example.com',
        displayName: 'Member Two',
        phoneNumber: '987-654-3210',
        role: 'admin',
        licenseNumber: '',
        licenseState: '',
        licenseExpiry: '',
        isEligibleDriver: false
      }
    ]);
  });
}

// Helper function to validate import data
function validateImportData(data: ImportMemberData[]): ImportMemberData[] {
  return data.filter(row => {
    // Email is required
    if (!row.email || !isValidEmail(row.email)) {
      return false;
    }
    
    // Validate role if provided
    if (row.role && row.role !== 'admin' && row.role !== 'member') {
      row.role = 'member'; // Default to member if invalid
    }
    
    // Validate license expiry date if provided
    if (row.licenseExpiry && !isValidDate(row.licenseExpiry)) {
      row.licenseExpiry = ''; // Clear if invalid
    }
    
    // Ensure isEligibleDriver is boolean
    if (row.isEligibleDriver !== undefined) {
      if (typeof row.isEligibleDriver !== 'boolean') {
        row.isEligibleDriver = String(row.isEligibleDriver).toLowerCase() === 'true';
      }
    }
    
    return true;
  });
}

// Helper function to check email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Helper function to check date format (YYYY-MM-DD)
function isValidDate(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// Process member imports
async function processMemberImports(groupId: number, members: ImportMemberData[], creatorId: number) {
  const results = {
    successCount: 0,
    errorCount: 0,
    errors: [] as string[],
    processedMembers: [] as any[] // Track processed users for debugging
  };
  
  console.log(`Starting to process ${members.length} members for import to group ${groupId}`);
  
  for (const member of members) {
    try {
      console.log(`Processing member: ${member.email}`);
      
      // Check if user already exists
      let user = await storage.getUserByEmail(member.email);
      console.log(`User lookup result for ${member.email}:`, user ? `Found user ID ${user.id}` : 'User not found');
      
      if (!user) {
        // Create new user if they don't exist
        console.log(`Creating new user for ${member.email}`);
        const tempPassword = generateTempPassword();
        const hashedPassword = await hashPassword(tempPassword);
        
        user = await storage.createUser({
          username: member.email,
          email: member.email,
          password: hashedPassword,
          displayName: member.displayName || member.email.split('@')[0],
          phoneNumber: member.phoneNumber || null,
          licenseNumber: member.licenseNumber || null,
          licenseState: member.licenseState || null,
          licenseExpiry: member.licenseExpiry ? new Date(member.licenseExpiry) : null,
          isEligibleDriver: member.isEligibleDriver || false,
          emailVerified: false
        });
        
        console.log(`Created user with ID ${user.id} for ${member.email}`);
        
        // Generate verification token
        const verificationToken = generateVerificationToken();
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 7); // 7 days validity
        
        await storage.updateUserVerification(user.id, {
          verificationToken,
          verificationTokenExpiry: expiry
        });
        console.log(`Updated verification token for user ${user.id}`);
      }
      
      // Check if already a member of the group
      console.log(`Checking if user ${user.id} is already member of group ${groupId}`);
      const groupMembers = await storage.getGroupMembers(groupId);
      console.log(`Group ${groupId} has ${groupMembers.length} members:`, groupMembers.map(m => m.userId));
      
      const isMember = groupMembers.some(m => m.userId === user!.id);
      
      if (!isMember) {
        // Add to group with specified role
        console.log(`Adding user ${user.id} to group ${groupId} with role ${member.role || 'member'}`);
        
        try {
          const addResult = await storage.addUserToGroup({
            groupId,
            userId: user.id,
            role: member.role || 'member'
          });
          console.log(`addUserToGroup result:`, addResult);
          
          // Double-check with direct SQL if needed (fallback)
          if (!addResult) {
            console.error(`Failed to add user ${user.id} to group ${groupId} - no result returned`);
            results.errors.push(`Failed to add user ${member.email} to group - no confirmation`);
            results.errorCount++;
            continue;
          }
        } catch (error) {
          const addError = error as Error;
          console.error(`Error adding user ${user.id} to group ${groupId}:`, addError);
          
          // Try direct SQL insert as fallback
          try {
            console.log(`Attempting fallback direct insertion for user ${user.id}`);
            const now = new Date();
            const query = `INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES ($1, $2, $3, $4) RETURNING *;`;
            const result = await db.query.raw(query, [groupId, user.id, member.role || 'member', now]);
            console.log(`Direct SQL insertion result:`, result);
          } catch (sqlErr) {
            console.error(`Fallback insertion also failed:`, sqlErr);
            results.errors.push(`Failed to add user ${member.email} to group: ${addError.message || 'Unknown error'}`);
            results.errorCount++;
            continue;
          }
        }
        
        // Send invitation email
        const group = await storage.getGroup(groupId);
        if (group) {
          try {
            await sendGroupInvitation(
              user.email,
              group.name,
              user.username, // inviterName
              `/groups/${groupId}`, // inviteLink
              true // isExistingUser
            );
            console.log(`Invitation email sent to ${user.email}`);
          } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
          }
        }
        
        results.processedMembers.push({
          email: user.email,
          userId: user.id,
          status: 'added'
        });
        
        results.successCount++;
      } else {
        console.log(`User ${user.id} (${member.email}) is already a member of this group`);
        results.errors.push(`User ${member.email} is already a member of this group`);
        results.errorCount++;
        
        results.processedMembers.push({
          email: user.email,
          userId: user.id,
          status: 'already_member'
        });
      }
    } catch (error: any) {
      console.error(`Error processing member ${member.email}:`, error);
      results.errors.push(`Failed to import ${member.email}: ${error.message || 'Unknown error'}`);
      results.errorCount++;
      
      results.processedMembers.push({
        email: member.email,
        status: 'error',
        error: error.message || 'Unknown error'
      });
    }
  }
  
  // After import, validate that members were actually added
  console.log(`Import complete. Verifying group membership...`);
  try {
    const updatedGroupMembers = await storage.getGroupMembers(groupId);
    console.log(`Group ${groupId} now has ${updatedGroupMembers.length} members:`, updatedGroupMembers.map(m => m.userId));
  } catch (e) {
    console.error(`Failed to verify group membership:`, e);
  }
  
  return results;
}

// Helper to generate random temp password
function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate verification token
function generateVerificationToken(): string {
  return require('crypto').randomBytes(32).toString('hex');
}
