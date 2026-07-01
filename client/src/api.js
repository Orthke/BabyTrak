// Thin fetch wrapper around the BabyTrak API.

// The browser clock and the API server clock can disagree by several seconds
// (e.g. when the server runs in a VM/container whose clock has drifted). Live
// timers like the nap stopwatch measure elapsed = now - serverStart, so that
// skew would otherwise make a just-started timer sit at 0:00 until the browser
// clock catches up. We read the server's `Date` response header on every call
// to track the offset, and anchor those timers to serverNow() instead.
let serverClockOffsetMs = 0;

export function serverNow() {
  return Date.now() + serverClockOffsetMs;
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const serverDate = res.headers.get('Date');
  if (serverDate) {
    const serverMs = Date.parse(serverDate);
    if (!Number.isNaN(serverMs)) serverClockOffsetMs = serverMs - Date.now();
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const withBaby = (data, babyId) => ({ ...data, baby_id: babyId });
const withCaregiver = (data, caregiverId) => ({ ...data, caregiver_id: caregiverId });
const q = (babyId) => `?babyId=${babyId ?? ''}`;
const qc = (caregiverId) => `?caregiverId=${caregiverId ?? ''}`;

export const api = {
  // Babies
  listBabies: () => request('/babies'),
  createBaby: (data) => request('/babies', { method: 'POST', body: JSON.stringify(data) }),
  updateBaby: (id, data) => request(`/babies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBaby: (id) => request(`/babies/${id}`, { method: 'DELETE' }),

  // Caregivers (parents/others who track only their own medications)
  listCaregivers: () => request('/caregivers'),
  createCaregiver: (data) => request('/caregivers', { method: 'POST', body: JSON.stringify(data) }),
  updateCaregiver: (id, data) => request(`/caregivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaregiver: (id) => request(`/caregivers/${id}`, { method: 'DELETE' }),

  // Feedings (breast | bottle | both)
  listFeedings: (babyId) => request(`/feedings${q(babyId)}`),
  createFeeding: (data, babyId) =>
    request('/feedings', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updateFeeding: (id, data) => request(`/feedings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFeeding: (id) => request(`/feedings/${id}`, { method: 'DELETE' }),

  // Pumping
  listPumps: (babyId) => request(`/pumps${q(babyId)}`),
  createPump: (data, babyId) =>
    request('/pumps', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updatePump: (id, data) => request(`/pumps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePump: (id) => request(`/pumps/${id}`, { method: 'DELETE' }),

  // Diapers
  listDiapers: (babyId) => request(`/diapers${q(babyId)}`),
  createDiaper: (data, babyId) =>
    request('/diapers', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updateDiaper: (id, data) => request(`/diapers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDiaper: (id) => request(`/diapers/${id}`, { method: 'DELETE' }),

  // Medication catalog (dropdown options). category: 'baby' | 'caregiver'.
  listMedications: (category) =>
    request(`/medications${category ? `?category=${category}` : ''}`),
  createMedication: (data) => request('/medications', { method: 'POST', body: JSON.stringify(data) }),
  deleteMedication: (id) => request(`/medications/${id}`, { method: 'DELETE' }),

  // Medication doses (logged events) — for a baby
  listMedDoses: (babyId) => request(`/med-doses${q(babyId)}`),
  createMedDose: (data, babyId) =>
    request('/med-doses', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updateMedDose: (id, data) => request(`/med-doses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMedDose: (id) => request(`/med-doses/${id}`, { method: 'DELETE' }),

  // Medication doses — for a caregiver
  listCaregiverMedDoses: (caregiverId) => request(`/med-doses${qc(caregiverId)}`),
  createCaregiverMedDose: (data, caregiverId) =>
    request('/med-doses', { method: 'POST', body: JSON.stringify(withCaregiver(data, caregiverId)) }),

  // Milestone catalog (dropdown options: presets + user-added custom)
  listMilestoneTypes: () => request('/milestone-types'),
  createMilestoneType: (data) => request('/milestone-types', { method: 'POST', body: JSON.stringify(data) }),
  deleteMilestoneType: (id) => request(`/milestone-types/${id}`, { method: 'DELETE' }),

  // Milestones (logged events)
  listMilestones: (babyId) => request(`/milestones${q(babyId)}`),
  createMilestone: (data, babyId) =>
    request('/milestones', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updateMilestone: (id, data) => request(`/milestones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMilestone: (id) => request(`/milestones/${id}`, { method: 'DELETE' }),

  // Sleep / nap sessions. A nap with end_time === null is still running.
  listSleeps: (babyId) => request(`/sleeps${q(babyId)}`),
  activeSleep: (babyId) => request(`/sleeps/active${q(babyId)}`),
  createSleep: (data, babyId) =>
    request('/sleeps', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updateSleep: (id, data) => request(`/sleeps/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSleep: (id) => request(`/sleeps/${id}`, { method: 'DELETE' }),

  // Measurements (weight / length recorded at a point in time)
  listMeasurements: (babyId) => request(`/measurements${q(babyId)}`),
  createMeasurement: (data, babyId) =>
    request('/measurements', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  updateMeasurement: (id, data) => request(`/measurements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMeasurement: (id) => request(`/measurements/${id}`, { method: 'DELETE' }),

  // Temperatures (a reading for a baby OR a caregiver)
  listTemperatures: (babyId) => request(`/temperatures${q(babyId)}`),
  listCaregiverTemperatures: (caregiverId) => request(`/temperatures${qc(caregiverId)}`),
  createTemperature: (data, babyId) =>
    request('/temperatures', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  createCaregiverTemperature: (data, caregiverId) =>
    request('/temperatures', { method: 'POST', body: JSON.stringify(withCaregiver(data, caregiverId)) }),
  updateTemperature: (id, data) => request(`/temperatures/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTemperature: (id) => request(`/temperatures/${id}`, { method: 'DELETE' }),

  // Blood pressures (a reading for a baby OR a caregiver)
  listBloodPressures: (babyId) => request(`/blood-pressures${q(babyId)}`),
  listCaregiverBloodPressures: (caregiverId) => request(`/blood-pressures${qc(caregiverId)}`),
  createBloodPressure: (data, babyId) =>
    request('/blood-pressures', { method: 'POST', body: JSON.stringify(withBaby(data, babyId)) }),
  createCaregiverBloodPressure: (data, caregiverId) =>
    request('/blood-pressures', { method: 'POST', body: JSON.stringify(withCaregiver(data, caregiverId)) }),
  updateBloodPressure: (id, data) => request(`/blood-pressures/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBloodPressure: (id) => request(`/blood-pressures/${id}`, { method: 'DELETE' }),

  // Aggregates
  timeline: (babyId) => request(`/timeline${q(babyId)}`),
  // Pass `date` (YYYY-MM-DD) to scope to a single calendar day instead of a range.
  stats: (babyId, days = 14, date = null) =>
    request(`/stats?babyId=${babyId ?? ''}&days=${days}${date ? `&date=${date}` : ''}`),
  caregiverTimeline: (caregiverId) => request(`/caregiver-timeline${qc(caregiverId)}`),
  caregiverStats: (caregiverId, days = 14) => request(`/caregiver-stats?caregiverId=${caregiverId ?? ''}&days=${days}`),
};

// Generic delete by kind (used by the timeline view).
export function deleteByKind(kind, id) {
  if (kind === 'feed') return api.deleteFeeding(id);
  if (kind === 'pump') return api.deletePump(id);
  if (kind === 'diaper') return api.deleteDiaper(id);
  if (kind === 'med') return api.deleteMedDose(id);
  if (kind === 'milestone') return api.deleteMilestone(id);
  if (kind === 'sleep') return api.deleteSleep(id);
  if (kind === 'measurement') return api.deleteMeasurement(id);
  if (kind === 'temperature') return api.deleteTemperature(id);
  if (kind === 'bp') return api.deleteBloodPressure(id);
  throw new Error(`Unknown kind: ${kind}`);
}

// Generic update by kind (used by the timeline edit modal).
export function updateByKind(kind, id, data) {
  if (kind === 'feed') return api.updateFeeding(id, data);
  if (kind === 'pump') return api.updatePump(id, data);
  if (kind === 'diaper') return api.updateDiaper(id, data);
  if (kind === 'med') return api.updateMedDose(id, data);
  if (kind === 'milestone') return api.updateMilestone(id, data);
  if (kind === 'sleep') return api.updateSleep(id, data);
  if (kind === 'measurement') return api.updateMeasurement(id, data);
  if (kind === 'temperature') return api.updateTemperature(id, data);
  if (kind === 'bp') return api.updateBloodPressure(id, data);
  throw new Error(`Unknown kind: ${kind}`);
}
