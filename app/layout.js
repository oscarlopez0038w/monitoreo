import './globals.css';

export const metadata = {
  title: 'Sinsa | VTEX Monitoring',
  description: 'Plataforma ejecutiva para análisis de ventas, monitoreo OMS, control de stock de seguridad e integración VTEX para SINSA Nicaragua.',
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
