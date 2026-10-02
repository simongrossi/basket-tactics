import './globals.css';
import { InterfaceLevelProvider } from '@/components/interface/InterfaceLevel';

export const metadata = {
  title: 'Basket Tactics',
  description: 'Simulateur tactique basket — analyse des systèmes offensifs et défensifs',
};

// Pose le thème avant le premier rendu pour éviter un flash clair → sombre.
// Même règle que useTheme (clair par défaut, sombre si choisi ou si système).
const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('bt:theme');d.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}catch(e){d.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* suppressHydrationWarning : certaines extensions navigateur (Dark
          Reader, Grammarly, gestionnaires de mots de passe…) injectent des
          nœuds dans <body> avant l'hydration React. Ça causait des warnings
          de mismatch sans bug réel. La directive ne masque les warnings
          QUE sur ce nœud — les divergences plus profondes restent
          détectées normalement. */}
      <body suppressHydrationWarning style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <InterfaceLevelProvider>{children}</InterfaceLevelProvider>
      </body>
    </html>
  );
}
