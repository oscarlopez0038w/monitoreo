'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, User, Lock, Eye, EyeOff, LogIn, AlertCircle, ShieldCheck, Key, CheckCircle2, RefreshCw, X } from 'lucide-react';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams ? searchParams.get('redirect') || '/' : '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Estado de Recuperación de Contraseña
  const [isRecoverModalOpen, setIsRecoverModalOpen] = useState(false);
  const [recoverStep, setRecoverStep] = useState(1); // 1: Email, 2: New Password, 3: Success
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverNewPassword, setRecoverNewPassword] = useState('');
  const [recoverConfirmPassword, setRecoverConfirmPassword] = useState('');
  const [recoverShowPass, setRecoverShowPass] = useState(false);
  const [recoverError, setRecoverError] = useState('');
  const [recoverSuccess, setRecoverSuccess] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);

  const handleOpenRecoverModal = () => {
    setIsRecoverModalOpen(true);
    setRecoverStep(1);
    setRecoverEmail(username.trim());
    setRecoverNewPassword('');
    setRecoverConfirmPassword('');
    setRecoverError('');
    setRecoverSuccess('');
  };

  const handleRecoverEmailSubmit = async (e) => {
    e.preventDefault();
    setRecoverError('');
    if (!recoverEmail.trim()) {
      setRecoverError('Por favor ingresa tu correo electrónico registrado.');
      return;
    }
    setRecoverLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoverEmail.trim(), action: 'verify_email' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecoverStep(2);
        setRecoverError('');
      } else {
        setRecoverError(data.error || 'No se pudo verificar la cuenta.');
      }
    } catch (err) {
      setRecoverError('Error de conexión. Intente nuevamente.');
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleRecoverResetPassword = async (e) => {
    e.preventDefault();
    setRecoverError('');
    if (!recoverNewPassword || recoverNewPassword.length < 6) {
      setRecoverError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (recoverNewPassword !== recoverConfirmPassword) {
      setRecoverError('Las contraseñas no coinciden. Verifíquelas.');
      return;
    }

    setRecoverLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: recoverEmail.trim(), newPassword: recoverNewPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecoverStep(3);
        setRecoverSuccess(data.message);
      } else {
        setRecoverError(data.error || 'Error al restablecer la contraseña.');
      }
    } catch (err) {
      setRecoverError('Error de red. Intente nuevamente.');
    } finally {
      setRecoverLoading(false);
    }
  };

  // Verificar si ya tiene sesión activa
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.authenticated) {
          router.replace(redirectUrl);
        }
      } catch (e) {
        // No autenticado
      }
    }
    checkAuth();
  }, [router, redirectUrl]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Por favor ingrese su usuario y contraseña.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Credenciales inválidas. Intente nuevamente.');
        setIsLoading(false);
        return;
      }

      // Redirección al dashboard o ruta de origen
      router.push(redirectUrl);
      router.refresh();
    } catch (err) {
      console.error('Error de inicio de sesión:', err);
      setError('Error de conexión con el servidor. Intente más tarde.');
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 20%, #0f172a 0%, #070a13 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '1.5rem',
      }}
    >
      {/* Background Ambient Glow FX */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, rgba(59, 130, 246, 0.05) 50%, transparent 80%)',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '10%',
          width: '450px',
          height: '450px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
          filter: 'blur(90px)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Login Glass Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '2.5rem 2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(56, 189, 248, 0.1)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #38bdf8, #3b82f6)',
              boxShadow: '0 10px 25px -5px rgba(56, 189, 248, 0.5)',
              marginBottom: '1rem',
            }}
          >
            <Zap size={28} color="#ffffff" />
          </div>

          <h1
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              margin: '0 0 0.4rem 0',
            }}
          >
            SINSA OMS
          </h1>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8', fontWeight: 500 }}>
            Plataforma Ejecutiva de Monitoreo & Control
          </p>
        </div>

        {/* Error Alert Message */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.5rem',
              color: '#fca5a5',
              fontSize: '0.85rem',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Username Input */}
          <div>
            <label
              htmlFor="username"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '0.45rem',
              }}
            >
              Correo Electrónico o Usuario
            </label>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <User size={18} />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ejemplo@sinsa.com.ni o usuario"
                disabled={isLoading}
                required
                autoComplete="username"
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem 0.85rem 2.75rem',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontSize: '0.92rem',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                }}
                className="input-focus-glow"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  margin: 0,
                }}
              >
                Contraseña
              </label>

              <button
                type="button"
                onClick={handleOpenRecoverModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'color 0.15s ease',
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Lock size={18} />
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={isLoading}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '0.85rem 2.75rem 0.85rem 2.75rem',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontSize: '0.92rem',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                }}
                className="input-focus-glow"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '0.35rem',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '6px',
                }}
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Security Row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              margin: '0.2rem 0',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <ShieldCheck size={14} color="#38bdf8" /> SSL Seguro
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              marginTop: '0.5rem',
              width: '100%',
              padding: '0.9rem 1.5rem',
              background: isLoading
                ? 'rgba(56, 189, 248, 0.5)'
                : 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
              border: 'none',
              borderRadius: '12px',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              boxShadow: isLoading
                ? 'none'
                : '0 10px 20px -5px rgba(56, 189, 248, 0.4)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {isLoading ? (
              <>
                <div
                  style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                Iniciando sesión...
              </>
            ) : (
              <>
                <LogIn size={19} />
                Iniciar Sesión
              </>
            )}
          </button>
        </form>

        {/* Footer info & Register link */}
        <div style={{ marginTop: '1.75rem', textAlign: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.25rem' }}>
          <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            ¿No tienes cuenta?{' '}
            <Link href="/register" style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}>
              Solicita tu acceso aquí
            </Link>
          </p>
          <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>
            SINSA Nicaragua © {new Date().getFullYear()} • Sistema de Monitoreo OMS & Inventario
          </p>
        </div>
      </div>

      {/* Modal de Recuperación de Contraseña */}
      {isRecoverModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(7, 10, 19, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setIsRecoverModalOpen(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.99))',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 30px rgba(56, 189, 248, 0.2)',
              borderRadius: '20px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.75rem',
              color: '#ffffff',
              boxSizing: 'border-box',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                  <Key size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                    Recuperar Contraseña
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                    {recoverStep === 1 ? 'Paso 1: Verificación de Correo' : recoverStep === 2 ? 'Paso 2: Nueva Contraseña' : 'Completado'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsRecoverModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.2rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Error Message */}
            {recoverError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{recoverError}</span>
              </div>
            )}

            {/* Step 1: Verificar Correo */}
            {recoverStep === 1 && (
              <form onSubmit={handleRecoverEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0, lineHeight: '1.4' }}>
                  Ingresa tu correo electrónico corporativo registrado para verificar tu cuenta e iniciar el restablecimiento de contraseña.
                </p>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                    Correo Electrónico
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type="email"
                      value={recoverEmail}
                      onChange={(e) => setRecoverEmail(e.target.value)}
                      placeholder="ejemplo@sinsa.com.ni"
                      required
                      disabled={recoverLoading}
                      style={{
                        width: '100%',
                        padding: '0.8rem 1rem 0.8rem 2.6rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '10px',
                        color: '#ffffff',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsRecoverModalOpen(false)}
                    className="btn-secondary"
                    style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', flex: 1 }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={recoverLoading}
                    className="btn-primary"
                    style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    {recoverLoading ? <RefreshCw size={16} className="animate-spin" /> : <Key size={16} />}
                    {recoverLoading ? 'Verificando...' : 'Verificar Cuenta'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Ingresar Nueva Contraseña */}
            {recoverStep === 2 && (
              <form onSubmit={handleRecoverResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '0.75rem', borderRadius: '10px', fontSize: '0.82rem', color: '#38bdf8' }}>
                  ✅ Cuenta verificada: <strong>{recoverEmail}</strong>. Ingrese su nueva contraseña a continuación.
                </div>

                {/* Nueva Contraseña */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                    Nueva Contraseña (Mín. 6 caracteres)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type={recoverShowPass ? 'text' : 'password'}
                      value={recoverNewPassword}
                      onChange={(e) => setRecoverNewPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={6}
                      disabled={recoverLoading}
                      style={{
                        width: '100%',
                        padding: '0.8rem 2.6rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '10px',
                        color: '#ffffff',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setRecoverShowPass(!recoverShowPass)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                    >
                      {recoverShowPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirmar Contraseña */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.4rem' }}>
                    Confirmar Nueva Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type={recoverShowPass ? 'text' : 'password'}
                      value={recoverConfirmPassword}
                      onChange={(e) => setRecoverConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={6}
                      disabled={recoverLoading}
                      style={{
                        width: '100%',
                        padding: '0.8rem 2.6rem',
                        background: 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '10px',
                        color: '#ffffff',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setRecoverStep(1)}
                    className="btn-secondary"
                    style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', flex: 1 }}
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    disabled={recoverLoading}
                    className="btn-primary"
                    style={{ padding: '0.65rem 1rem', fontSize: '0.85rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                  >
                    {recoverLoading ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {recoverLoading ? 'Guardando...' : 'Cambiar Contraseña'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Éxito */}
            {recoverStep === 3 && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto', color: '#34d399' }}>
                  <CheckCircle2 size={28} />
                </div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', margin: '0 0 0.5rem 0' }}>
                  ¡Contraseña Restablecida!
                </h4>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                  {recoverSuccess || 'Tu contraseña ha sido actualizada exitosamente. Ya puedes ingresar al sistema.'}
                </p>

                <button
                  onClick={() => {
                    setIsRecoverModalOpen(false);
                    setUsername(recoverEmail);
                    setPassword('');
                  }}
                  className="btn-primary"
                  style={{ width: '100%', padding: '0.75rem 1.5rem', fontSize: '0.9rem', fontWeight: 700 }}
                >
                  Iniciar Sesión Ahora
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      <style jsx global>{`
        .input-focus-glow:focus {
          border-color: #38bdf8 !important;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2) !important;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#070a13',
            color: '#38bdf8',
            fontWeight: 600,
          }}
        >
          Cargando inicio de sesión...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
