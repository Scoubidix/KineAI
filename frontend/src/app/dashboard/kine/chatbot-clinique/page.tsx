// Ancienne page IA Clinique — fusionnée dans le chat unifié.
import { redirect } from 'next/navigation';

export default function LegacyChatbotCliniqueRedirect() {
  redirect('/dashboard/kine/chat');
}
