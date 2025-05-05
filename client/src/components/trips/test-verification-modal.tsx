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
          className="bg-red-600 hover:bg-red-700 font-bold shadow-lg">
          TEST PHONE VERIFICATION
        </Button>
      </div>

      {/* Configuration panel in bottom right */}
      <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50">
        <h3 className="text-md font-semibold mb-3">Phone Verification Test</h3>
        
        <div className="flex flex-col space-y-3">
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Enter phone number (with +)"
            className="px-3 py-2 border border-gray-300 rounded-md"
          />
          
          <Button 
            onClick={handleOpenModal}
            size="sm"
            className="bg-blue-600">
            Open Verification Modal
          </Button>

          {testResult && (
            <div className="text-sm text-green-600 mt-2">
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
