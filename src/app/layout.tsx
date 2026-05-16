import './globals.css';

export const metadata = {
  title: 'Basket Tactics',
  description: 'Simulateur tactique basket — analyse des systèmes offensifs et défensifs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      {/* suppressHydrationWarning : certaines extensions navigateur (Dark
          Reader, Grammarly, gestionnaires de mots de passe…) injectent des
          nœuds dans <body> avant l'hydration React. Ça causait des warnings
          de mismatch sans bug réel. La directive ne masque les warnings
          QUE sur ce nœud — les divergences plus profondes restent
          détectées normalement. */}
      <body suppressHydrationWarning style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#171a20' }}>
        {children}
      </body>
    </html>
  );
}
