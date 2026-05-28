'use client';

import React from 'react';
import {
  Clock, Shield, FileCheck2, LayoutGrid, BadgeCheck, Download,
  UserPlus, LogIn, UserCheck, ArrowRight, ChevronRight, Check,
} from 'lucide-react';
import styles from './IdentifyWelcome.module.css';

interface IdentifyWelcomeProps {
  publicInfo: {
    type: 'REMPLACEMENT_LIBERAL' | 'ASSISTANAT_LIBERAL';
    initiator: { firstName: string; lastName: string };
    destinataireFirstName: string;
    expiresAt: string;
    hasExistingAccount: boolean;
  };
  onPrimary: () => void;
  onGuest: () => void;
}

export default function IdentifyWelcome({ publicInfo, onPrimary, onGuest }: IdentifyWelcomeProps) {
  const initFullName = `${publicInfo.initiator.lastName} ${publicInfo.initiator.firstName}`.trim();
  const initials = `${(publicInfo.initiator.firstName[0] || '').toUpperCase()}${(publicInfo.initiator.lastName[0] || '').toUpperCase()}`;
  const expiresLabel = publicInfo.expiresAt
    ? new Date(publicInfo.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const contractWord = publicInfo.type === 'REMPLACEMENT_LIBERAL' ? 'remplacement' : 'assistanat libéral';

  const primaryLabel = publicInfo.hasExistingAccount
    ? 'Me connecter et accéder au contrat'
    : 'Créer mon compte et accéder au contrat';
  const primarySub = publicInfo.hasExistingAccount
    ? 'Compte déjà existant pour cet email'
    : 'Gratuit · Sans carte bancaire · 2 minutes';
  const PrimaryIcon = publicInfo.hasExistingAccount ? LogIn : UserPlus;

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.expiryBadge} ${styles.anim} ${styles.d1}`}>
        <Clock size={11} />
        Lien valable jusqu&apos;au {expiresLabel}
      </div>

      <div className={`${styles.senderCard} ${styles.anim} ${styles.d2}`}>
        <div className={styles.senderRow}>
          <div className={styles.senderAvatar}>{initials}</div>
          <div>
            <p className={styles.senderName}>{initFullName} vous invite</p>
            <p className={styles.senderRole}>Kinésithérapeute libéral</p>
          </div>
        </div>
      </div>

      <div className={`${styles.hero} ${styles.anim} ${styles.d3}`}>
        <p className={styles.heroTag}>👋 Bonjour {publicInfo.destinataireFirstName}</p>
        <h1 className={styles.heroTitle}>
          Votre contrat de<br /><em>{contractWord}</em><br />vous attend.
        </h1>
        <p className={styles.heroSub}>
          Lisez, complétez et signez votre contrat libéral en quelques minutes — depuis votre téléphone ou votre ordinateur.
        </p>
      </div>

      <div className={`${styles.freeBlock} ${styles.anim} ${styles.d3}`}>
        <div className={styles.freeIcon}>
          <Shield size={17} />
        </div>
        <div>
          <p className={styles.freeTitle}>Module Contrats 100% gratuit</p>
          <p className={styles.freeDesc}>
            Créez votre compte et gérez <strong>tous vos contrats gratuitement</strong>, pour toujours. Aucune carte bancaire, aucune limite.
          </p>
        </div>
      </div>

      <div className={`${styles.anim} ${styles.d4}`}>
        <button type="button" onClick={onPrimary} className={styles.ctaPrimary}>
          <div className={styles.ctaLeft}>
            <div className={styles.ctaIcon}>
              <PrimaryIcon size={19} />
            </div>
            <div>
              <p className={styles.ctaLabel}>{primaryLabel}</p>
              <p className={styles.ctaSub}>{primarySub}</p>
            </div>
          </div>
          <div className={styles.ctaArr}>
            <ArrowRight size={19} />
          </div>
        </button>

        <button type="button" onClick={onGuest} className={styles.ctaSecondary}>
          <div className={styles.ctaSecLeft}>
            <UserCheck size={15} />
            <div>
              <p className={styles.ctaSecLabel}>Continuer sans compte</p>
              <p className={styles.ctaSecNote}>Accès limité — contrat non sauvegardé</p>
            </div>
          </div>
          <div className={styles.ctaSecArr}>
            <ChevronRight size={15} />
          </div>
        </button>
      </div>

      <p className={`${styles.sectionLabel} ${styles.anim} ${styles.d5}`}>En créant votre compte</p>
      <div className={`${styles.benefitsGrid} ${styles.anim} ${styles.d5}`}>
        <div className={styles.benefit}>
          <div className={styles.benefitIcon}><FileCheck2 size={15} /></div>
          <p className={styles.benefitLabel}>Contrat sauvegardé</p>
          <p className={styles.benefitDesc}>Retrouvez-le à tout moment dans votre espace</p>
        </div>
        <div className={styles.benefit}>
          <div className={styles.benefitIcon}><LayoutGrid size={15} /></div>
          <p className={styles.benefitLabel}>Infos pré-remplies</p>
          <p className={styles.benefitDesc}>Adeli, RPPS — plus jamais à ressaisir</p>
        </div>
        <div className={styles.benefit}>
          <div className={styles.benefitIcon}><BadgeCheck size={15} /></div>
          <p className={styles.benefitLabel}>Déclaration Ordre en 1 clic</p>
          <p className={styles.benefitDesc}>Déclaration pré-remplie, envoyée depuis l&apos;app</p>
        </div>
        <div className={styles.benefit}>
          <div className={styles.benefitIcon}><Download size={15} /></div>
          <p className={styles.benefitLabel}>Export PDF en un clic</p>
          <p className={styles.benefitDesc}>Contrat signé téléchargeable à tout moment</p>
        </div>
      </div>

      <div className={`${styles.reassurance} ${styles.anim} ${styles.d6}`}>
        <div className={styles.reaItem}><Shield size={11} />RGPD · Données chiffrées</div>
        <div className={styles.reaItem}><Check size={11} />Hébergement Europe</div>
        <div className={styles.reaItem}><Check size={11} />Aucun engagement</div>
      </div>

      <div className={styles.divider}></div>

      <div className={`${styles.makPromo} ${styles.anim} ${styles.d7}`}>
        <div className={styles.makPromoHead}>
          <div className={styles.makPromoLogo}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
            </svg>
          </div>
          <div>
            <p className={styles.makPromoName}>Mon Assistant Kiné</p>
            <p className={styles.makPromoTag}>Conçu par des kinés, pour des kinés</p>
          </div>
        </div>
        <p>
          Développé par <strong>deux kinésithérapeutes libéraux</strong>, MAK génère des bilans en <strong>3 minutes</strong>, détecte les drapeaux rouges et donne accès à <strong>56 000+ ressources scientifiques</strong>. Rejoignez les 200+ kinés qui l&apos;utilisent déjà.
        </p>
      </div>

      <footer className={`${styles.footer} ${styles.anim} ${styles.d8}`}>
        <p>
          <a href="https://www.monassistantkine.fr" target="_blank" rel="noopener noreferrer">monassistantkine.fr</a>
          {' · '}
          <a href="/legal/mentions-legales.html" target="_blank" rel="noopener noreferrer">Mentions légales</a>
          {' · '}
          <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer">Confidentialité</a>
          {' · '}
          <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">CGU</a>
        </p>
        <p>© {new Date().getFullYear()} Mon Assistant Kiné — Tous droits réservés</p>
      </footer>
    </div>
  );
}
