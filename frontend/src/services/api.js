const API_BASE = '/api';

export async function fetchStats(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/dashboard/stats?${query}`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

export async function fetchDealerSummary(dealerName) {
  const res = await fetch(`${API_BASE}/dashboard/dealer-summary?dealer_name=${encodeURIComponent(dealerName)}`);
  if (!res.ok) throw new Error(`Failed to fetch dealer summary for '${dealerName}'`);
  return res.json();
}

export async function fetchDevices(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/devices?${query}`);
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function fetchDeviceByImei(imei) {
  const res = await fetch(`${API_BASE}/devices/${encodeURIComponent(imei)}`);
  if (!res.ok) throw new Error(`Device '${imei}' not found`);
  return res.json();
}

export async function updateDeviceStatus(id, payload) {
  const res = await fetch(`${API_BASE}/devices/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to update device status');
  return res.json();
}

export async function updateDevice(id, payload) {
  const res = await fetch(`${API_BASE}/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update device');
  return data;
}

export async function deleteDevice(id) {
  const res = await fetch(`${API_BASE}/devices/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete device record');
  return data;
}

export async function bulkDeleteDevices(payload) {
  const res = await fetch(`${API_BASE}/devices/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete devices');
  return data;
}

export async function fetchDeviceTypes() {
  const res = await fetch(`${API_BASE}/device-types`);
  if (!res.ok) throw new Error('Failed to fetch device types');
  return res.json();
}

export async function createDeviceType(payload) {
  const res = await fetch(`${API_BASE}/device-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to create device type');
  return res.json();
}

export async function addDeviceColumn(deviceTypeId, columnName) {
  const res = await fetch(`${API_BASE}/device-types/columns/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_type_id: deviceTypeId, column_name: columnName })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add column');
  return data;
}

export async function renameDeviceColumn(deviceTypeId, oldName, newName) {
  const res = await fetch(`${API_BASE}/device-types/columns/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_type_id: deviceTypeId, old_name: oldName, new_name: newName })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to rename column');
  return data;
}

export async function deleteDeviceColumn(deviceTypeId, columnName) {
  const res = await fetch(`${API_BASE}/device-types/columns/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_type_id: deviceTypeId, column_name: columnName })
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete column');
  return data;
}

export async function previewPurchaseUpload(formData) {
  const res = await fetch(`${API_BASE}/purchase-batches/preview`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) throw new Error('Failed to preview upload file');
  return res.json();
}

export async function confirmPurchaseUpload(payload) {
  const res = await fetch(`${API_BASE}/purchase-batches/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to confirm purchase upload');
  return res.json();
}

export async function fetchPurchaseBatches() {
  const res = await fetch(`${API_BASE}/purchase-batches`);
  if (!res.ok) throw new Error('Failed to fetch purchase batches');
  return res.json();
}

export async function deletePurchaseBatch(id) {
  try {
    const res = await fetch(`${API_BASE}/purchase-batches/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) return data;
    }
  } catch (e) {
    console.warn('DELETE /purchase-batches/:id failed, attempting fallback...', e);
  }

  // Resilient fallback to bulk-delete
  const fallbackRes = await fetch(`${API_BASE}/devices/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchase_batch_id: parseInt(id) })
  });
  const fallbackData = await fallbackRes.json();
  if (!fallbackRes.ok || !fallbackData.success) {
    throw new Error(fallbackData.error || 'Failed to delete upload list');
  }
  return fallbackData;
}

export async function fetchDispatches(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/dispatches?${query}`);
  if (!res.ok) throw new Error('Failed to fetch dispatches');
  return res.json();
}

export async function fetchDispatchById(id) {
  const res = await fetch(`${API_BASE}/dispatches/${id}`);
  if (!res.ok) throw new Error('Failed to fetch dispatch details');
  return res.json();
}

export async function createDispatch(payload) {
  const res = await fetch(`${API_BASE}/dispatches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create dispatch');
  return data;
}

export async function returnDispatchStock(payload) {
  const res = await fetch(`${API_BASE}/dispatches/return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to return stock');
  return res.json();
}

export async function fetchDealerStockSummary() {
  const res = await fetch(`${API_BASE}/dispatches/summary/dealer-stock`);
  if (!res.ok) throw new Error('Failed to fetch dealer stock summary');
  return res.json();
}

export async function recordInstallation(payload) {
  const res = await fetch(`${API_BASE}/installations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to record installation');
  return data;
}

export async function recordBulkInstallations(payload) {
  const res = await fetch(`${API_BASE}/installations/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to record bulk installations');
  return data;
}

export async function fetchInstallations(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/installations?${query}`);
  if (!res.ok) throw new Error('Failed to fetch installations');
  return res.json();
}

export async function fetchCustomers(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/customers?${query}`);
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}

export async function fetchCustomerById(id) {
  const res = await fetch(`${API_BASE}/customers/${id}`);
  if (!res.ok) throw new Error('Failed to fetch customer details');
  return res.json();
}

export async function updateCustomer(id, payload) {
  const res = await fetch(`${API_BASE}/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update customer');
  return data;
}

export async function deleteCustomer(id) {
  const res = await fetch(`${API_BASE}/customers/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete customer');
  return data;
}

export async function lookupCustomerByPhone(phone) {
  const res = await fetch(`${API_BASE}/customers/lookup/phone/${encodeURIComponent(phone)}`);
  if (!res.ok) throw new Error('Failed to lookup customer');
  return res.json();
}

export async function fetchUsers() {
  const res = await fetch(`${API_BASE}/users`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function createUser(payload) {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create user');
  return data;
}

export async function updateUser(id, payload) {
  const res = await fetch(`${API_BASE}/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update user');
  return data;
}

export async function deleteUser(id) {
  const res = await fetch(`${API_BASE}/users/${id}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete user');
  return data;
}

export async function fetchReportOptions() {
  const res = await fetch(`${API_BASE}/reports/options`);
  if (!res.ok) throw new Error('Failed to fetch report filter options');
  return res.json();
}

export async function fetchReportPreview(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/reports/preview?${query}`);
  if (!res.ok) throw new Error('Failed to fetch report preview');
  return res.json();
}

export async function fetchDailyDistributionReport() {
  const res = await fetch(`${API_BASE}/reports/daily-distribution`);
  if (!res.ok) throw new Error('Failed to fetch daily distribution report');
  return res.json();
}

export async function globalSearchDevices(query) {
  const res = await fetch(`${API_BASE}/devices/global-search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to perform global search');
  return res.json();
}

export async function bulkAssignDealer(payload) {
  const res = await fetch(`${API_BASE}/devices/bulk-assign-dealer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to assign devices to dealer');
  return res.json();
}

export async function fetchDealersSummary() {
  const res = await fetch(`${API_BASE}/devices/dealers-summary`);
  if (!res.ok) throw new Error('Failed to fetch dealers summary');
  return res.json();
}

export async function fetchAuditLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/devices/audit-logs?${query}`);
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

export async function bulkTransferDevices(payload) {
  const res = await fetch(`${API_BASE}/devices/bulk-transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Failed to transfer devices');
  return data;
}

