import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useContacts, type Contact } from './use-contacts';

export interface ChatAppointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string | null;
  type: string | null;
  status: string;
  notes: string | null;
}

export interface ContactPanelForm {
  fullName: string;
  phone: string;
  email: string;
  source: string | null;
  status: string | null;
  nextAppointmentDate: string;
  firstContactDate: string;
  tags: string[];
  notes: string;
}

function emptyForm(): ContactPanelForm {
  return {
    fullName: '',
    phone: '',
    email: '',
    source: null,
    status: null,
    nextAppointmentDate: '',
    firstContactDate: '',
    tags: [],
    notes: '',
  };
}

function contactToForm(c: Contact): ContactPanelForm {
  return {
    fullName: c.fullName ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    source: c.source ?? null,
    status: c.status ?? null,
    nextAppointmentDate: c.nextAppointment
      ? new Date(c.nextAppointment).toISOString().split('T')[0]
      : '',
    firstContactDate: c.firstContactDate
      ? new Date(c.firstContactDate).toISOString().split('T')[0]
      : '',
    tags: Array.isArray(c.tags) ? [...c.tags] : [],
    notes: c.notes ?? '',
  };
}

/**
 * Port of `use-chat-contact-panel.ts` from the Vue app: form population from
 * the selected contact, contact save, and fetching that contact's appointments.
 * The Vue `watch(..., { immediate: true, deep: true })` is expressed as a
 * `useEffect` keyed on the contact object.
 */
export function useChatContactPanel(
  contactId: string | null,
  contact: Contact | null,
  onSaved: () => void,
) {
  const { updateContact, fetchContact } = useContacts();

  const [form, setForm] = useState<ContactPanelForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [contactAppointments, setContactAppointments] = useState<ChatAppointment[]>([]);

  const fetchContactExtras = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/contacts/${id}/appointments`);
      setContactAppointments(res.data.appointments ?? []);
    } catch (err) {
      console.error('fetchContactExtras error:', err);
    }
  }, []);

  const reloadAppointments = useCallback(async () => {
    if (!contactId) return;
    try {
      const res = await api.get(`/contacts/${contactId}/appointments`);
      setContactAppointments(res.data.appointments ?? []);
    } catch (err) {
      console.error('reloadAppointments error:', err);
    }
  }, [contactId]);

  useEffect(() => {
    if (!contact) return;
    setForm(contactToForm(contact));
    void fetchContactExtras(contact.id);
  }, [contact, fetchContactExtras]);

  const saveContact = useCallback(async () => {
    if (!contactId) return;
    setSaving(true);
    setSaveSuccess(false);
    setSaveError(false);

    const result = await updateContact(contactId, {
      fullName: form.fullName || null,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source || null,
      status: form.status || null,
      nextAppointment: form.nextAppointmentDate
        ? new Date(form.nextAppointmentDate + 'T00:00:00').toISOString()
        : null,
      firstContactDate: form.firstContactDate
        ? new Date(form.firstContactDate + 'T00:00:00').toISOString()
        : null,
      tags: form.tags,
      notes: form.notes || null,
    });

    setSaving(false);
    if (result) {
      const fresh = await fetchContact(contactId);
      if (fresh) setForm(contactToForm(fresh));
      setSaveSuccess(true);
      onSaved();
      window.setTimeout(() => setSaveSuccess(false), 2500);
    } else {
      setSaveError(true);
    }
  }, [contactId, form, updateContact, fetchContact, onSaved]);

  return {
    form,
    setForm,
    saving,
    saveSuccess,
    setSaveSuccess,
    saveError,
    setSaveError,
    contactAppointments,
    saveContact,
    reloadAppointments,
  };
}
