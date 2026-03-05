'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Plus, Pencil, Trash2, Search, Loader2, X, Mail, Phone } from 'lucide-react';

interface Contact {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
}



interface ContactsManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  getAuthToken: () => Promise<string | undefined>;
}

export default function ContactsManagementModal({
  open, onOpenChange, apiBase, getAuthToken
}: ContactsManagementModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formFirstName, setFormFirstName] = useState('');
  const [formLastName, setFormLastName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formType, setFormType] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      loadContacts();
      setSearchQuery('');
      setIsEditing(false);
      setEditingContact(null);
    }
  }, [open]);

  const loadContacts = async () => {
    try {
      setIsLoading(true);
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/api/contacts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setContacts(data.contacts);
    } catch (error) {
      console.error('Erreur chargement contacts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredContacts = contacts.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
    return name.includes(q) || (c.email && c.email.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q)) || (c.type && c.type.toLowerCase().includes(q));
  });

  const openCreateForm = () => {
    setEditingContact(null);
    setFormFirstName('');
    setFormLastName('');
    setFormEmail('');
    setFormPhone('');
    setFormType('');
    setIsEditing(true);
  };

  const openEditForm = (contact: Contact) => {
    setEditingContact(contact);
    setFormFirstName(contact.firstName || '');
    setFormLastName(contact.lastName || '');
    setFormEmail(contact.email || '');
    setFormPhone(contact.phone || '');
    setFormType(contact.type || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const token = await getAuthToken();
      const payload = {
        firstName: formFirstName || null,
        lastName: formLastName || null,
        email: formEmail || null,
        phone: formPhone || null,
        type: formType || null
      };

      if (editingContact) {
        await fetch(`${apiBase}/api/contacts/${editingContact.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(`${apiBase}/api/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      }

      setIsEditing(false);
      await loadContacts();
    } catch (error) {
      console.error('Erreur sauvegarde contact:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      setIsDeleting(true);
      const token = await getAuthToken();
      await fetch(`${apiBase}/api/contacts/${confirmDeleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadContacts();
    } catch (error) {
      console.error('Erreur suppression contact:', error);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#3899aa]" />
            Mes contacts
          </DialogTitle>
        </DialogHeader>

        {isEditing ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{editingContact ? 'Modifier le contact' : 'Nouveau contact'}</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Prénom</label>
                <Input value={formFirstName} onChange={e => setFormFirstName(e.target.value)} placeholder="Prénom" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Nom</label>
                <Input value={formLastName} onChange={e => setFormLastName(e.target.value)} placeholder="Nom" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@exemple.com" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="06 12 34 56 78" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Type (ex: Médecin, Mutuelle, Secrétariat...)</label>
              <Input value={formType} onChange={e => setFormType(e.target.value)} placeholder="Type de contact" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)}>Annuler</Button>
              <Button className="btn-teal" onClick={handleSave} disabled={isSaving || (!formFirstName && !formLastName)}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingContact ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Recherche — fixe */}
            <div className="shrink-0 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Rechercher un contact..." className="pl-9" />
              </div>
              <Button size="sm" className="btn-teal" onClick={openCreateForm}>
                <Plus className="h-4 w-4 mr-1" /> Nouveau
              </Button>
            </div>

            {/* Liste scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center h-full flex items-center justify-center">
                  {contacts.length === 0 ? 'Aucun contact. Créez votre premier contact !' : 'Aucun contact trouvé'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredContacts.map(contact => (
                    <div key={contact.id} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">
                              {contact.firstName} {contact.lastName}
                            </p>
                            {contact.type && (
                              <Badge variant="secondary" className="text-xs">{contact.type}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {contact.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditForm(contact)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteId(contact.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Modal confirmation suppression */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-md top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-sm sm:text-base">
            Êtes-vous sûr de vouloir supprimer ce contact ? Cette action est irréversible.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-4 mt-4">
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Oui, supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
