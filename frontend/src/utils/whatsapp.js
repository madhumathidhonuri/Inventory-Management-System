/**
 * Helper to build standard WhatsApp message URL for FuelTracks customer credentials
 */
export function buildCustomerCredentialsWhatsAppMessage({
  phone = '',
  customerName = 'Customer',
  userId = '',
  password = 'Provided separately',
  vehicleNumber = ''
}) {
  const cleanDigits = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  // Format with India 91 prefix if 10 digits
  const targetPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

  const username = userId && String(userId).trim() !== ''
    ? String(userId).trim()
    : customerName && customerName !== 'Customer'
    ? String(customerName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : cleanDigits || 'HARIPRASADREDDY';

  const pass = password && String(password).trim() !== '' ? String(password).trim() : '123456';

  const message = `*Dear Customer,*

Greetings from *FuelTracks Technologies Pvt. Ltd.*!

Your GPS Tracking Device has been successfully installed and activated.

*Your Login Credentials:*

👤 *User ID:* ${username}
🔑 *Password:* ${pass}

*Download the Volty Track App:*

*Android:* https://play.google.com/store/apps/details?id=com.lovable.fleettracker

*iPhone (iOS):* https://apps.apple.com/in/app/volty-track/id1627979448

After installing the app, log in using the above credentials to access:
* Live Vehicle Tracking
* Trip History
* Route Playback
* Alerts & Notifications

For any assistance with login or app usage, please feel free to contact our support team.

*Thank you for choosing FuelTracks Technologies Pvt. Ltd. We appreciate your trust and look forward to serving you.*`;

  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  return { message, url, targetPhone, username, password: pass };
}
