const db = require('../db/database');

console.log('=== STARTING INVENTORY DATA CLEANUP & SYNC ===\n');

function normalizeDate(dStr) {
  if (!dStr) return new Date().toISOString().split('T')[0];
  const s = String(dStr).trim();
  // Match DD-MM-YYYY
  const dm = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dm) {
    return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  }
  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().split('T')[0];
}

const fixTransaction = db.transaction(() => {
  const devices = db.prepare('SELECT * FROM devices').all();
  console.log(`Processing ${devices.length} devices...`);

  let simUpdated = 0;
  let ghostColumnsCleaned = 0;
  let installationsCreated = 0;
  let customersCreated = 0;

  for (const dev of devices) {
    let attrs = {};
    try {
      attrs = JSON.parse(dev.additional_attributes || '{}');
    } catch {
      attrs = {};
    }

    let modifiedAttrs = false;

    // 1. Clean Ghost Columns (_1 -> SIM 2 ICCID, _2 -> SECONDARY SERIAL)
    if (attrs._1 !== undefined) {
      if (attrs._1 && !attrs['SIM 2 ICCID']) {
        attrs['SIM 2 ICCID'] = attrs._1;
      }
      delete attrs._1;
      modifiedAttrs = true;
      ghostColumnsCleaned++;
    }
    if (attrs._2 !== undefined) {
      if (attrs._2 && !attrs['SECONDARY SERIAL']) {
        attrs['SECONDARY SERIAL'] = attrs._2;
      }
      delete attrs._2;
      modifiedAttrs = true;
    }

    // 2. Map Primary SIM Number from ICCID
    let simNum = dev.sim_number;
    if (!simNum && attrs.ICCID) {
      simNum = String(attrs.ICCID).trim();
      simUpdated++;
    }

    // 3. Check for Fitment / Installation Data
    const vehicleNo = (attrs['VEHICLE NUMBER'] || attrs['Vehicle Number'] || '').toString().trim().toUpperCase();
    const customerName = (attrs['CUSTOMER NAME'] || attrs['Customer Name'] || '').toString().trim();
    const customerPhone = (attrs['CUSTOMER PHONE NUMBER'] || attrs['Customer Phone'] || attrs['Phone Number'] || '9999999999').toString().trim();

    let newStatus = dev.current_status;
    let newHolderType = dev.current_holder_type;
    let newHolderName = dev.current_holder_name;

    if (vehicleNo && customerName) {
      // Find or create Customer
      let cust = db.prepare('SELECT * FROM customers WHERE phone_number = ?').get(customerPhone);
      let customerId;

      if (!cust) {
        const insCust = db.prepare(`
          INSERT INTO customers (name, phone_number, email, address, aadhar_number, pan_number, software_user_id, software_password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          customerName,
          customerPhone,
          attrs['EMAIL ID'] || null,
          attrs['RTO LOCATION'] || attrs['STOCK PLACE'] || 'Vijayawada',
          attrs['AADHAR NUMBER'] || null,
          attrs['PAN CARD'] || attrs['PAN NUMBER'] || null,
          attrs['USERNAME'] || null,
          attrs['PASSWORD'] || '123456'
        );
        customerId = insCust.lastInsertRowid;
        customersCreated++;
      } else {
        customerId = cust.id;
      }

      // Check if installation already exists for this device
      const existingInst = db.prepare('SELECT id FROM installations WHERE device_id = ? OR imei_number = ?').get(dev.id, dev.imei_number);

      const instDate = normalizeDate(attrs['CERTIFICATE ISSUED DATE'] || attrs['PAYMENT DATE'] || attrs['STOCK PLACE DATE'] || dev.purchase_date);
      const rawPrice = attrs['TOTAL COST'] || attrs['COST'] || attrs['SALE PRICE'] || '0';
      const salePrice = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
      const rawPaymentStatus = (attrs['AMOUNT RECEIVED'] || '').toUpperCase();
      const paymentStatus = (rawPaymentStatus === 'RECEIVED' || rawPaymentStatus === 'PAID' || rawPaymentStatus === 'YES') ? 'RECEIVED' : 'PENDING';

      if (!existingInst) {
        db.prepare(`
          INSERT INTO installations (
            device_id, imei_number, customer_id, installation_date, installed_by,
            sales_manager, sales_person, customer_name, customer_contact,
            vehicle_number, vehicle_type, sale_price, installation_location,
            payment_status, aadhar_number, pan_number, chasis_number,
            engine_number, software_user_id, software_password, payment_date,
            remarks
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?
          )
        `).run(
          dev.id,
          dev.imei_number,
          customerId,
          instDate,
          attrs['SALES PERSON NAME'] || attrs['SALES MANAGER'] || 'Admin',
          attrs['SALES MANAGER'] || null,
          attrs['SALES PERSON NAME'] || null,
          customerName,
          customerPhone,
          vehicleNo,
          attrs['CATEGORY'] || 'Commercial',
          salePrice,
          attrs['RTO LOCATION'] || attrs['STOCK PLACE'] || 'Guntur',
          paymentStatus,
          attrs['AADHAR NUMBER'] || null,
          attrs['PAN CARD'] || null,
          attrs['CHASIS NUMBER'] || null,
          attrs['ENGINE NUMBER'] || null,
          attrs['USERNAME'] || null,
          attrs['PASSWORD'] || '123456',
          attrs['PAYMENT DATE'] ? normalizeDate(attrs['PAYMENT DATE']) : instDate,
          `Imported fitment - Stock Place: ${attrs['STOCK PLACE'] || 'Guntur'}`
        );
        installationsCreated++;
      }

      newStatus = 'INSTALLED';
      newHolderType = 'CUSTOMER';
      newHolderName = `${customerName} (${vehicleNo})`;
    } else if (attrs['STOCK PLACE']) {
      newStatus = 'WITH_DEALER';
      newHolderType = 'DEALER';
      newHolderName = attrs['STOCK PLACE'];
    }

    const updatedAttrsJson = JSON.stringify(attrs);

    db.prepare(`
      UPDATE devices
      SET sim_number = ?,
          current_status = ?,
          current_holder_type = ?,
          current_holder_name = ?,
          additional_attributes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(simNum, newStatus, newHolderType, newHolderName, updatedAttrsJson, dev.id);
  }

  // Also clean up template columns in device_types table
  const types = db.prepare('SELECT id, name, template_columns FROM device_types').all();
  for (const t of types) {
    if (t.template_columns) {
      try {
        let cols = JSON.parse(t.template_columns);
        if (Array.isArray(cols)) {
          const cleanedCols = cols.filter(c => c !== '_1' && c !== '_2');
          if (cleanedCols.length !== cols.length) {
            db.prepare('UPDATE device_types SET template_columns = ? WHERE id = ?').run(JSON.stringify(cleanedCols), t.id);
            console.log(`Cleaned template_columns for device_type ${t.name}`);
          }
        }
      } catch {}
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`✅ SIM Numbers mapped to devices.sim_number: ${simUpdated}`);
  console.log(`✅ Ghost columns (_1, _2) cleaned: ${ghostColumnsCleaned}`);
  console.log(`✅ Customers provisioned: ${customersCreated}`);
  console.log(`✅ Fitment records created in installations table: ${installationsCreated}`);
  console.log(`✅ Device statuses updated to INSTALLED: ${installationsCreated}`);
});

try {
  fixTransaction();
  console.log('\n🎉 ALL INVENTORY DATA FIXES COMPLETED SUCCESSFULLY!');
} catch (err) {
  console.error('Error during cleanup transaction:', err);
}

process.exit(0);
