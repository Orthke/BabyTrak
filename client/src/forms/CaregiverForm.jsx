import { useState, useRef } from 'react';
import { useDirty } from '../components/Modal.jsx';

// Caregivers only need a name — they exist to track their own medications.
export default function CaregiverForm({ caregiver, onSave, onCancel, notify, hideCancel }) {
  const isEdit = !!caregiver;
  const [name, setName] = useState(caregiver?.name ?? '');
  const [saving, setSaving] = useState(false);

  const initialName = useRef(name);
  useDirty(name !== initialName.current);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim() });
      notify?.(isEdit ? 'Caregiver updated' : `Added ${name.trim()}`);
    } catch (e) {
      notify?.('Error: ' + e.message);
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={name}
          placeholder="e.g. Mom, Dad, Grandma"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
      </div>

      <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={save}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add caregiver'}
      </button>
      {!hideCancel && (
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
