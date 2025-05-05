import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PhoneVerificationModal } from './phone-verification-modal';
import { useQuery } from '@tanstack/react-query';

export default function TestVerificationModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [testResult, setTestResult] = useState('');

  // Get user data for phone number
  const { data: userData } = useQuery<{
    id: number;
    username: string;
    displayName: string;
    email: string;
    phoneNumber?: string;
  }>({
    queryKey: ["/api/user"],
  });

  useEffect(() => {
    // Set phone number from user data if available
    if (userData?.phoneNumber && !phoneNumber) {
      setPhoneNumber(userData.phoneNumber);
      console.log('Setting phone number from user data:', userData.phoneNumber);
    }
  }, [userData, phoneNumber]);

  const handleOpenModal = () => {
    console.log('Opening test verification modal with phone number:', phoneNumber);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    console.log('Closing test verification modal');
    setIsModalOpen(false);
  };

  const handleVerificationComplete = () => {
    console.log('Test verification completed successfully');
    setTestResult('Verification completed successfully! ✅');
    setIsModalOpen(false);
  };

  return (
    <>
      {/* Test button at bottom left */}
      <div className="fixed bottom-20 left-4 z-50">
        <Button 
          onClick={handleOpenModal}
          size="lg"
          className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg px-6 py-8 rounded-xl animate-pulse">
          <span className="text-lg">TEST PHONE VERIFICATION</span>
          <span className="block text-xs mt-1">(Using E.164 format with +1 prefix)</span>
        </Button>
      </div>

      {/* Configuration panel in bottom right */}
      <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50">
        <h3 className="text-md font-semibold mb-3">Phone Verification Settings</h3>
        
        <div className="flex flex-col space-y-3">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Test phone number:</label>
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter phone number (with +)"
              className="px-3 py-2 border border-gray-300 rounded-md w-full"
            />
            <p className="text-xs text-gray-500 mt-1 italic">Format must include country code (e.g., <code className="bg-gray-100 px-1 rounded">+14258353425</code>)</p>
          </div>
          
          <Button 
            onClick={handleOpenModal}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white">
            Open Verification Modal
          </Button>

          {testResult && (
            <div className="text-sm bg-green-50 border border-green-200 text-green-700 p-3 rounded-md mt-2">
              {testResult}
            </div>
          )}
        </div>
      </div>

      {/* The actual verification modal */}
      <PhoneVerificationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onComplete={handleVerificationComplete}
        phoneNumber={phoneNumber || '+14258353425'}
      />
    </>
  );
}
