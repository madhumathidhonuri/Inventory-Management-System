/**
 * WhatsApp Helper Utilities for FuelTracks Technologies Pvt. Ltd.
 * Supports Single & Multi-Vehicle Consolidated Reminders with Base Cost & GST calculations.
 */

// Helper to format Indian Currency INR
export function formatINR(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '₹0';
  return `₹${Math.round(num).toLocaleString('en-IN')}`;
}

// Helper to format Excel serial numbers or standard date strings into clean DD-MM-YYYY
export function formatDisplayCellValue(headerName, rawVal) {
  if (rawVal === undefined || rawVal === null) return '-';
  const str = String(rawVal).trim();
  if (!str || str === '-') return '-';

  // Check if header is related to date / timestamp / validity
  if (/date|month|validity|timestamp|time/i.test(headerName)) {
    const num = Number(str);
    // Excel Serial Number (e.g. 46242, 46030, 46089, 46364)
    if (!isNaN(num) && num > 30000 && num < 65000) {
      try {
        const d = new Date(Math.round((num - 25569) * 86400 * 1000));
        let day = d.getUTCDate();
        let month = d.getUTCMonth() + 1;
        const year = d.getUTCFullYear();

        // Disambiguate Excel US locale day-first flips (e.g. DD/08/2026 was saved as Day 8 in US Excel)
        if (day === 8 && year === 2026 && d.getUTCMonth() < 12) {
          day = d.getUTCMonth() + 1;
          month = 8;
        } else if (day === 7 && year === 2026 && d.getUTCMonth() < 12) {
          day = d.getUTCMonth() + 1;
          month = 7;
        } else if (day === 6 && year === 2026 && d.getUTCMonth() < 12) {
          day = d.getUTCMonth() + 1;
          month = 6;
        }

        const dd = String(day).padStart(2, '0');
        const mm = String(month).padStart(2, '0');
        return `${dd}-${mm}-${year}`;
      } catch {
        return str;
      }
    }

    // Standard ISO or hyphenated date e.g. YYYY-MM-DD -> DD-MM-YYYY
    const parts = str.split(/[-/]/);
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    }
  }

  return str;
}

/**
 * Helper to build standard WhatsApp message URL for FuelTracks customer credentials
 */
export function buildCustomerCredentialsWhatsAppMessage({
  phone = '',
  customerName = 'Customer',
  userId = '',
  password = 'Provided separately',
  vehicleNumber = '',
  vehicles = []
}) {
  const cleanDigits = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const targetPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

  const username = userId && String(userId).trim() !== ''
    ? String(userId).trim()
    : customerName && customerName !== 'Customer'
    ? String(customerName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    : cleanDigits || 'HARIPRASADREDDY';

  const pass = password && String(password).trim() !== '' ? String(password).trim() : '123456';

  let vehicleListText = vehicleNumber ? `*Vehicle:* ${vehicleNumber}` : '';
  if (vehicles && vehicles.length > 0) {
    vehicleListText = `*Active Fleet (${vehicles.length} Vehicles):*\n` +
      vehicles.map((v, i) => `${i + 1}. *${v.vehicleNumber || v.vehicle_number || v}*`).join('\n');
  }

  const message = `*Dear ${customerName || 'Customer'},*

Greetings from *FuelTracks Technologies Pvt. Ltd.*!

Your GPS Tracking Device(s) have been successfully installed and activated.

${vehicleListText ? `${vehicleListText}\n\n` : ''}*Your Volty Track App Login Credentials:*

👤 *User ID / Mobile:* ${username}
🔑 *Password:* ${pass}

*Download the Volty Track App:*
📲 *Android:* https://play.google.com/store/apps/details?id=com.lovable.fleettracker
🍏 *iPhone (iOS):* https://apps.apple.com/in/app/volty-track/id1627979448

Log in to access Live Tracking, Route Playback, Geofence Alerts & Speed Reports.

*FuelTracks Technologies Pvt. Ltd.*
📞 Support: +91 998800234 | www.fueltracks.in`;

  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  return { message, url, targetPhone, username, password: pass };
}

/**
 * Enhanced 1-Click WhatsApp Payment Due Reminder
 * Handles BOTH Single Vehicle and Consolidated Multi-Vehicle Fleet with Cost & GST breakdowns
 */
export function buildPaymentDueReminderWhatsAppMessage({
  phone = '',
  customerName = 'Valued Customer',
  vehicleNumber = '',
  amount = 0,
  cost = 0,
  gst = 0,
  totalCost = 0,
  imei = '',
  stockPlace = '',
  vehicles = [] // Optional array of vehicle objects for Consolidated Reminders
}) {
  const cleanDigits = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const targetPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

  let message = '';

  // Multi-Vehicle Consolidated Reminder
  if (vehicles && vehicles.length > 1) {
    let sumBaseCost = 0;
    let sumGst = 0;
    let sumTotal = 0;

    const breakdownLines = vehicles.map((v, idx) => {
      const vVeh = v.vehicleNumber || v.vehicle_number || `Vehicle ${idx + 1}`;
      const vImei = v.imei || v.imei_number ? `(IMEI: ${String(v.imei || v.imei_number).slice(-6)})` : '';
      
      let vBase = parseFloat(v.cost || 0);
      let vTotal = parseFloat(v.totalCost || v.total_cost || v.amount || 0);
      let vGst = parseFloat(v.gst || 0);

      // Auto calculate GST if total > base and gst not explicitly provided
      if (!vGst && vTotal > vBase && vBase > 0) {
        vGst = vTotal - vBase;
      } else if (!vTotal && vBase > 0) {
        vTotal = vBase + vGst;
      } else if (!vBase && vTotal > 0) {
        vBase = vTotal;
      }

      sumBaseCost += vBase;
      sumGst += vGst;
      sumTotal += (vTotal || vBase);

      if (vGst > 0) {
        return `${idx + 1}. *${vVeh}* ${vImei}\n   Cost: ${formatINR(vBase)} + GST: ${formatINR(vGst)} = *${formatINR(vTotal)}*`;
      } else {
        return `${idx + 1}. *${vVeh}* ${vImei} ➔ *${formatINR(vTotal || vBase)}*`;
      }
    });

    const hasAnyGst = sumGst > 0;

    message = `*Dear ${customerName || 'Customer'},*

Greetings from *FuelTracks Technologies Pvt. Ltd.*! 🚗

This is a consolidated payment reminder for the AIS-140 GPS / VLTD tracking devices installed across your fleet (*${vehicles.length} Vehicles*):

*Fleet Breakdown:*
${breakdownLines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━━━
📦 *Total Pending Vehicles:* ${vehicles.length}
${hasAnyGst ? `💵 *Total Base Cost:* ${formatINR(sumBaseCost)}\n📑 *Total GST (18%):* ${formatINR(sumGst)}\n` : ''}💰 *GRAND TOTAL DUE:* *${formatINR(sumTotal || sumBaseCost)}*
━━━━━━━━━━━━━━━━━━━━━━

🏢 *Branch / Dealer:* ${stockPlace || 'FuelTracks Central'}

Kindly arrange the consolidated payment at your earliest convenience via UPI (PhonePe / GPay / Paytm) or Bank Transfer to ensure uninterrupted tracking service and valid VAHAN certificate compliance.

If payment is already initiated, please share the transaction reference with us.

Thank you for choosing *FuelTracks*!
📞 Support: +91 998800234 | www.fueltracks.in`;

  } else {
    // Single Vehicle Reminder with Cost & GST breakdown
    let baseCost = parseFloat(cost || 0);
    let total = parseFloat(totalCost || amount || 0);
    let gstVal = parseFloat(gst || 0);

    if (!gstVal && total > baseCost && baseCost > 0) {
      gstVal = total - baseCost;
    } else if (!total && baseCost > 0) {
      total = baseCost + gstVal;
    } else if (!baseCost && total > 0) {
      baseCost = total;
    }

    const singleVeh = vehicleNumber || (vehicles[0] && (vehicles[0].vehicleNumber || vehicles[0].vehicle_number)) || 'Your Vehicle';
    const singleImei = imei || (vehicles[0] && (vehicles[0].imei || vehicles[0].imei_number)) || 'Assigned GPS Unit';

    let commercialBreakdown = '';
    if (gstVal > 0) {
      commercialBreakdown = `💵 *Base Cost:* ${formatINR(baseCost)}
📑 *GST Amount:* ${formatINR(gstVal)}
💰 *Total Amount Due:* *${formatINR(total)}*`;
    } else {
      commercialBreakdown = `💰 *Pending Amount Due:* *${formatINR(total || baseCost)}*`;
    }

    message = `*Dear ${customerName || 'Customer'},*

Greetings from *FuelTracks Technologies Pvt. Ltd.*! 🚗

This is a gentle payment reminder regarding the AIS-140 GPS / VLTD device installed on your vehicle:

📋 *Vehicle Number:* ${singleVeh}
🏷️ *Device IMEI:* ${singleImei}
${commercialBreakdown}
🏢 *Branch / Dealer:* ${stockPlace || 'FuelTracks Central'}

Kindly arrange the payment at your earliest convenience via UPI (PhonePe / GPay / Paytm) or Bank Transfer to ensure uninterrupted tracking service and valid VAHAN certificate compliance.

If you have already made the payment, please share the transaction receipt with us.

Thank you for choosing *FuelTracks*!
📞 Support: +91 998800234 | www.fueltracks.in`;
  }

  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  return { message, url, targetPhone };
}

/**
 * 1-Click WhatsApp Payment Confirmation / Receipt
 * Sends official acknowledgement when customer payment is received (Single or Fleet)
 */
export function buildPaymentConfirmationWhatsAppMessage({
  phone = '',
  customerName = 'Valued Customer',
  vehicleNumber = '',
  amount = 0,
  cost = 0,
  gst = 0,
  totalCost = 0,
  paymentMode = 'UPI / PhonePe',
  confirmationDate = '',
  stockPlace = '',
  vehicles = []
}) {
  const cleanDigits = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const targetPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const dateStr = confirmationDate || new Date().toISOString().split('T')[0];

  let message = '';

  if (vehicles && vehicles.length > 1) {
    let sumBaseCost = 0;
    let sumGst = 0;
    let sumTotal = 0;

    vehicles.forEach((v) => {
      let vBase = parseFloat(v.cost || 0);
      let vTotal = parseFloat(v.totalCost || v.total_cost || v.amount || 0);
      let vGst = parseFloat(v.gst || 0);
      if (!vGst && vTotal > vBase && vBase > 0) vGst = vTotal - vBase;
      sumBaseCost += vBase || vTotal;
      sumGst += vGst;
      sumTotal += (vTotal || vBase);
    });

    const vehListStr = vehicles.map(v => v.vehicleNumber || v.vehicle_number || 'Veh').join(', ');

    message = `*🧾 FUELTRACKS PAYMENT CONFIRMATION RECEIPT*

*Dear ${customerName || 'Customer'},*

We have successfully received and verified your payment for your GPS tracking fleet. Thank you!

*Payment Summary:*
🚗 *Fleet Vehicles (${vehicles.length}):* ${vehListStr}
${sumGst > 0 ? `💵 *Base Cost:* ${formatINR(sumBaseCost)}\n📑 *GST (18%):* ${formatINR(sumGst)}\n` : ''}💰 *TOTAL RECEIVED:* *${formatINR(sumTotal || sumBaseCost)}*
💳 *Payment Mode:* ${paymentMode}
📅 *Receipt Date:* ${dateStr}

✅ Your AIS-140 GPS subscriptions and VAHAN compliance certificates are fully active.

*FuelTracks Technologies Pvt. Ltd.*
📞 Support: +91 998800234 | www.fueltracks.in`;

  } else {
    let baseCost = parseFloat(cost || 0);
    let total = parseFloat(totalCost || amount || 0);
    let gstVal = parseFloat(gst || 0);
    if (!gstVal && total > baseCost && baseCost > 0) gstVal = total - baseCost;

    const veh = vehicleNumber || (vehicles[0] && (vehicles[0].vehicleNumber || vehicles[0].vehicle_number)) || 'Your Vehicle';

    message = `*🧾 FUELTRACKS PAYMENT CONFIRMATION RECEIPT*

*Dear ${customerName || 'Customer'},*

We have successfully received and verified your payment. Thank you!

*Payment Summary:*
🚗 *Vehicle Number:* ${veh}
${gstVal > 0 ? `💵 *Base Cost:* ${formatINR(baseCost || total - gstVal)}\n📑 *GST (18%):* ${formatINR(gstVal)}\n` : ''}💰 *Total Amount Received:* *${formatINR(total || baseCost)}*
💳 *Payment Mode:* ${paymentMode}
📅 *Receipt Date:* ${dateStr}

✅ Your AIS-140 GPS tracking subscription and VAHAN compliance certificate are active.

*FuelTracks Technologies Pvt. Ltd.*
📞 Support: +91 998800234 | www.fueltracks.in`;
  }

  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  return { message, url, targetPhone };
}

/**
 * Helper to build standard WhatsApp message for Fitment Receipt / Certificate
 */
export function buildFitmentReceiptWhatsAppMessage({
  phone = '',
  customerName = 'Valued Customer',
  vehicleNumber = 'Vehicle',
  imei = '',
  model = 'GPS Tracker',
  certificateDate = '',
  cost = 0,
  gst = 0,
  totalCost = '',
  paymentStatus = 'RECEIVED'
}) {
  const cleanDigits = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const targetPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

  let commercialStr = `💵 Total Amount: ${totalCost || '—'}`;
  if (cost && gst) {
    commercialStr = `💵 Base Cost: ${formatINR(cost)}\n📑 GST (18%): ${formatINR(gst)}\n💰 Total Amount: ${formatINR(cost + gst)}`;
  }

  const message = `*🧾 FUELTRACKS FITMENT & PAYMENT RECEIPT*

*Customer Details:*
👤 Name: ${customerName}
🚗 Vehicle No: ${vehicleNumber}

*Device & Hardware Details:*
📡 Model: ${model}
🏷️ IMEI: ${imei}
📅 Fitment Date: ${certificateDate || 'Completed'}

*Commercial Status:*
${commercialStr}
✅ Payment Status: *${paymentStatus}*

*Government Compliance:*
Govt. of India AIS-140 VLTD & Emergency Button certified.
Track your fleet 24/7 on the *Volty Track* App.

*FuelTracks Technologies Pvt. Ltd.*
Authorized GPS VLT Tracking Partner`;

  const url = targetPhone
    ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;

  return { message, url, targetPhone };
}
