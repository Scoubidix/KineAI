'use client';

import React from 'react';
import { Clock, Check, Users } from 'lucide-react';
import styles from './IdentifyWelcome.module.css';

interface IdentifyWelcomeProps {
  publicInfo: {
    type: 'REMPLACEMENT_LIBERAL' | 'ASSISTANAT_LIBERAL';
    initiator: { firstName: string; lastName: string };
    destinataireFirstName: string;
    expiresAt: string;
    hasExistingAccount: boolean;
  };
  onLogin: () => void;
  onSignup: () => void;
  onGuest: () => void;
}

const BENEFITS = [
  {
    label: 'Infos pré-remplies automatiquement',
    sub: "Numéro d'ordre, adresse, coordonnées : plus jamais à ressaisir",
  },
  {
    label: 'Tous tes contrats archivés',
    sub: "Retrouve n'importe quel contrat passé en quelques secondes",
  },
  {
    label: "Déclaration à l'Ordre en 1 clic",
    sub: 'Conformité automatique, sans paperasse manuelle',
  },
  {
    label: 'Export PDF en 1 clic',
    sub: 'Contrat signé, mis en forme, prêt à envoyer ou archiver',
  },
];

export default function IdentifyWelcome({ publicInfo, onLogin, onSignup, onGuest }: IdentifyWelcomeProps) {
  const initFullName = `${publicInfo.initiator.firstName} ${publicInfo.initiator.lastName}`.trim();
  const expiresLabel = publicInfo.expiresAt
    ? new Date(publicInfo.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const contractWord = publicInfo.type === 'REMPLACEMENT_LIBERAL' ? 'remplacement' : 'assistanat libéral';

  // Le bouton primaire s'adapte : si un compte existe déjà pour cet email, on met
  // « Me connecter » en avant ; sinon « Créer mon compte ». Les 3 actions restent visibles.
  const loginFirst = publicInfo.hasExistingAccount;

  return (
    <div className={styles.wrapper}>
      {/* STEPPER */}
      <div className={`${styles.stepper} ${styles.anim} ${styles.d1}`}>
        <div className={`${styles.step} ${styles.stepOn}`}>
          <span className={styles.stepNum}>1</span>
          <span className={styles.stepLabel}>Accès</span>
        </div>
        <span className={styles.stepperLine} />
        <div className={`${styles.step} ${styles.stepOff}`}>
          <span className={styles.stepNum}>2</span>
          <span className={styles.stepLabel}>Signature</span>
        </div>
      </div>

      {/* EXPIRATION */}
      {expiresLabel && (
        <div className={`${styles.expiryBadge} ${styles.anim} ${styles.d1}`}>
          <Clock size={11} />
          Lien valable jusqu&apos;au {expiresLabel}
        </div>
      )}

      {/* BANNIÈRE CONTEXTE */}
      <div className={`${styles.contextBanner} ${styles.anim} ${styles.d2}`}>
        <div className={styles.bannerIcon}>📋</div>
        <p>
          <strong>{initFullName}</strong> t&apos;a invité(e) à signer un{' '}
          <strong>contrat de {contractWord}</strong>. Il est prêt, il t&apos;attend.
        </p>
      </div>

      {/* HERO */}
      <div className={`${styles.hero} ${styles.anim} ${styles.d3}`}>
        <p className={styles.heroTag}>👋 Bonjour {publicInfo.destinataireFirstName}</p>
        <h1 className={styles.heroTitle}>
          Ton contrat est prêt.<br /><em>Prends 1 minute pour toi.</em>
        </h1>
        <p className={styles.heroSub}>
          Crée ton compte gratuit et tes infos seront pré-remplies, pour ce contrat
          et tous les suivants. Zéro ressaisie, zéro oubli.
        </p>
      </div>

      {/* AVANTAGES */}
      <div className={`${styles.benefitsCard} ${styles.anim} ${styles.d3}`}>
        <div className={styles.cardLabel}>Avec ton compte MAK, 100 % gratuit</div>
        {BENEFITS.map((b) => (
          <div key={b.label} className={styles.benefitRow}>
            <div className={styles.checkCircle}><Check size={12} /></div>
            <div>
              <div className={styles.benefitText}>{b.label}</div>
              <div className={styles.benefitSub}>{b.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AVERTISSEMENT PERTE */}
      <div className={`${styles.lossStrip} ${styles.anim} ${styles.d4}`}>
        <span className={styles.lossIcon}>⚠️</span>
        <p>
          Sans compte : <strong>ressaisie manuelle à chaque contrat</strong>, aucune
          sauvegarde, déclaration Ordre à gérer toi-même. Tu peux, mais tu reviendras.
        </p>
      </div>

      {/* CTA — 3 boutons, sans case à cocher (acceptation gérée à l'étape suivante) */}
      <div className={`${styles.ctaArea} ${styles.anim} ${styles.d4}`}>
        {loginFirst ? (
          <>
            <button type="button" onClick={onLogin} className={styles.ctaPrimary}>
              <span className={styles.ctaLabel}>Me connecter et accéder au contrat</span>
              <span className={styles.ctaSub}>Compte déjà existant pour cet email</span>
            </button>
            <button type="button" onClick={onSignup} className={styles.ctaSecondary}>
              <span className={styles.ctaSecLabel}>Créer un compte</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onSignup} className={styles.ctaPrimary}>
              <span className={styles.ctaLabel}>Créer mon compte, c&apos;est gratuit</span>
            </button>
            <button type="button" onClick={onLogin} className={styles.ctaSecondary}>
              <span className={styles.ctaSecLabel}>J&apos;ai déjà un compte, me connecter</span>
            </button>
          </>
        )}

        <p className={styles.trustLine}>
          Sans carte bancaire&nbsp;·&nbsp;Accès immédiat
        </p>

        <div className={styles.divider}><span>ou</span></div>

        <button type="button" onClick={onGuest} className={styles.ctaGhost}>
          <span className={styles.ctaGhostLabel}>Continuer sans compte</span>
          <span className={styles.ctaGhostNote}>Mes infos ne seront pas sauvegardées pour la prochaine fois</span>
        </button>
      </div>

      {/* COMMUNAUTÉ */}
      <div className={`${styles.community} ${styles.anim} ${styles.d5}`}>
        <div className={styles.communityBadge}>
          <Users size={13} />
          Créé par des kinés D.E. · Pour des kinés
        </div>
        <p>
          Rejoins la communauté de kinésithérapeutes libéraux qui simplifient leurs
          remplacements et récupèrent du temps pour ce qui compte vraiment.
        </p>
      </div>

      {/* FOOTER */}
      <footer className={`${styles.footer} ${styles.anim} ${styles.d6}`}>
        <p>
          <a href="https://www.monassistantkine.fr" target="_blank" rel="noopener noreferrer">monassistantkine.fr</a>
          {' · '}
          <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">CGU</a>
          {' · '}
          <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer">Confidentialité</a>
          {' · '}
          <a href="/legal/mentions-legales.html" target="_blank" rel="noopener noreferrer">Mentions légales</a>
        </p>
        <p>© {new Date().getFullYear()} Mon Assistant Kiné · Tous droits réservés</p>
      </footer>
    </div>
  );
}
