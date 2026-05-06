export const metadata = {
  title: 'Basket Tactics',
  description: 'Simulateur tactique basket — analyse des systèmes offensifs et défensifs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa' }}>
        {children}
      </body>
    </html>
  );
}
