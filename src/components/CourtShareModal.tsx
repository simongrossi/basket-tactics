'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Copy, Check, Sparkles, Link, Code, Film } from 'lucide-react';
import type { AppState } from '@/lib/types';
import { createShareHash } from '@/lib/state/urlCompression';
import { encodeSituationCode, encodeAnimationCode, type SituationView } from '@/lib/state/situationCode';

interface CourtShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  situationView?: SituationView;
}

export function CourtShareModal({ isOpen, onClose, state, situationView }: CourtShareModalProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'ai' | 'code'>('link');
  const [shareUrl, setShareUrl] = useState('');
  const [situationCode, setSituationCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedAi, setCopiedAi] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsGenerating(true);

    // Génération parallèle de l'URL et du code de situation
    Promise.all([
      createShareHash(state).then((hash) => {
        if (typeof window !== 'undefined') {
          return `${window.location.origin}${window.location.pathname}${hash}`;
        }
        return hash;
      }),
      encodeSituationCode(state, situationView),
    ])
      .then(([url, code]) => {
        if (!cancelled) {
          setShareUrl(url);
          setSituationCode(code);
          setIsGenerating(false);
        }
      })
      .catch((err) => {
        console.error('Erreur lors de la génération du partage :', err);
        if (!cancelled) setIsGenerating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, state, situationView]);

  if (!isOpen) return null;

  const currentStep = state.steps[state.activeStep];
  const stepLabel = currentStep?.label ? `"${currentStep.label}"` : `Étape ${state.activeStep + 1}`;
  
  // Prompt prêt pour l'IA (Antigravity, ChatGPT, Claude)
  const aiPrompt = `Voici la situation tactique actuelle de Basket Tactics (${state.playerCount}x${state.playerCount}, ${state.steps.length} étape(s), étape active : ${stepLabel}) :

Lien interactif direct :
${shareUrl}

Code de situation (BT1) :
\`\`\`
${situationCode}
\`\`\`

Peux-tu analyser cette disposition tactique, les spacing des attaquants, et me suggérer la meilleure continuité offensive / adaptation défensive ?`;

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Erreur de copie dans le presse-papiers', e);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        style={{
          width: 'min(580px, 100%)',
          maxHeight: '90vh',
          background: '#181c24',
          border: '1px solid #333d4d',
          borderRadius: 14,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          color: '#f3f4f6',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'shareModalAppear 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #28313f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, #1f2530 0%, #181c24 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.16)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              <Share2 size={18} />
            </div>
            <div>
              <h2 id="share-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 750, color: '#f8fafc' }}>
                Partager la situation tactique
              </h2>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {state.playerCount}x{state.playerCount} · {state.steps.length} étape(s) · {stepLabel}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              width: 30,
              height: 30,
              borderRadius: 6,
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Onglets */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #28313f',
            background: '#13161c',
            padding: '0 16px',
            gap: 4,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('link')}
            style={{
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'link' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'link' ? '#93c5fd' : '#94a3b8',
              fontWeight: activeTab === 'link' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Link size={15} /> Lien joueur / coach
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            style={{
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'ai' ? '2px solid #a855f7' : '2px solid transparent',
              color: activeTab === 'ai' ? '#d8b4fe' : '#94a3b8',
              fontWeight: activeTab === 'ai' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Sparkles size={15} /> Copier pour l'IA
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            style={{
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'code' ? '2px solid #34d399' : '2px solid transparent',
              color: activeTab === 'code' ? '#6ee7b7' : '#94a3b8',
              fontWeight: activeTab === 'code' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Code size={15} /> Code BT1
          </button>
        </div>

        {/* Corps modal */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activeTab === 'link' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                Ce lien permet à un joueur, un coach adjoint ou un destinataire d'ouvrir directement ce système dans son navigateur en plein écran, sans rien installer.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#0f1217',
                  border: '1px solid #2d3748',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={isGenerating ? 'Génération du lien sécurisé…' : shareUrl}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    color: '#93c5fd',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    outline: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(shareUrl, setCopiedLink)}
                  disabled={isGenerating || !shareUrl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: copiedLink ? '#15803d' : '#2563eb',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isGenerating ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  {copiedLink ? 'Copié !' : 'Copier'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                Un prompt pré-formaté prêt à coller dans votre conversation avec <strong>l'IA (Antigravity, Claude, ChatGPT)</strong>. Il inclut le lien interactif complet et le code compact de la situation.
              </p>
              <div
                style={{
                  position: 'relative',
                  background: '#0f1217',
                  border: '1px solid #3b2d54',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#e9d5ff',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 180,
                    overflowY: 'auto',
                    lineHeight: 1.45,
                  }}
                >
                  {isGenerating ? 'Préparation du prompt tactique…' : aiPrompt}
                </pre>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(aiPrompt, setCopiedAi)}
                    disabled={isGenerating || !aiPrompt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: copiedAi ? '#15803d' : '#9333ea',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isGenerating ? 'wait' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {copiedAi ? <Check size={15} /> : <Sparkles size={15} />}
                    {copiedAi ? 'Prompt IA copié !' : 'Copier le prompt pour l\'IA'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                Code brut compressé (standard BT1). Vous pouvez l'importer dans n'importe quel Basket Tactics via le menu <em>« Coller une situation »</em>.
              </p>
              <textarea
                readOnly
                value={isGenerating ? 'Encodage…' : situationCode}
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: '#0f1217',
                  border: '1px solid #2d3748',
                  borderRadius: 8,
                  padding: 10,
                  color: '#6ee7b7',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  resize: 'none',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.select()}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => copyToClipboard(situationCode, setCopiedCode)}
                  disabled={isGenerating || !situationCode}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: copiedCode ? '#15803d' : '#059669',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isGenerating ? 'wait' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCode ? 'Code copié !' : 'Copier le code BT1'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
