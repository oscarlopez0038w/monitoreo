import './globals.css';

export const metadata = {
  title: 'VTEX SKU Extractor & Visualizer | SINSA',
  description: 'Aplicación minimalista y elegante para extraer y gestionar los SKUs de VTEX SINSA en Supabase.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
