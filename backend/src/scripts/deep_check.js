const db = require('../db/database');

console.log('=== DEEP ATTRIBUTE & CONSISTENCY CHECK ===\n');

const devices = db.prepare(`
  SELECT d.*, dt.name as device_type_name
  FROM devices d 
  LEFT JOIN device_types dt ON d.device_type_id = dt.id
`).all();

// Status breakdown
const statusCounts = {};
const holderCounts = {};
const missingFields = {
  noSim: 0,
  noPurchaseDate: 0,
  noVendor: 0,
  noStockPlace: 0,
  noDeviceName: 0
};

const stockPlaces = {};
const keyVariations = {};

devices.forEach(d => {
  statusCounts[d.current_status] = (statusCounts[d.current_status] || 0) + 1;
  const holder = `${d.current_holder_type || 'NONE'}: ${d.current_holder_name || 'UNNAMED'}`;
  holderCounts[holder] = (holderCounts[holder] || 0) + 1;

  let attrs = {};
  try {
    attrs = JSON.parse(d.additional_attributes || '{}');
  } catch {}

  Object.keys(attrs).forEach(k => {
    keyVariations[k] = (keyVariations[k] || 0) + 1;
  });

  if (!d.sim_number && !attrs.simno1 && !attrs['Sim 1'] && !attrs['SIM NUMBER']) missingFields.noSim++;
  if (!d.purchase_date) missingFields.noPurchaseDate++;
  if (!d.vendor_name || d.vendor_name === 'Direct Entry') missingFields.noVendor++;
  
  const place = d.current_holder_name || attrs['STOCK PLACE'] || attrs['Stock Place'] || attrs['stock_place'];
  if (place) {
    stockPlaces[place] = (stockPlaces[place] || 0) + 1;
  } else {
    missingFields.noStockPlace++;
  }

  const devName = attrs['DEVICE NAME'] || attrs['Device Name'] || d.device_type_name;
  if (!devName) missingFields.noDeviceName++;
});

console.log('1. STATUS DISTRIBUTION:', statusCounts);
console.log('\n2. HOLDER DISTRIBUTION:', holderCounts);
console.log('\n3. STOCK PLACES DISTRIBUTION:', stockPlaces);
console.log('\n4. ATTRIBUTE COMPLETENESS AUDIT:', missingFields);
console.log('\n5. ATTRIBUTE KEYS USED ACROSS INVENTORY:', keyVariations);

process.exit(0);
