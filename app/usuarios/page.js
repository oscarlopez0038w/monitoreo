'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Shield,
  UserPlus,
  Edit3,
  Trash2,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Lock,
  Mail,
  User as UserIcon,
  ShieldAlert,
  Key,
  Sliders,
  Plus,
  Check,
} from 'lucide-react';

export default function UsersManagementPage() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' o 'rbac'

  // Estado de Usuarios
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, admin: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Estado de Roles y Permisos (RBAC)
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);

  // Modales Usuarios
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Ejecutivo OMS',
    is_active: true,
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Modales Roles
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [newRoleData, setNewRoleData] = useState({ name: '', description: '' });
  const [roleError, setRoleError] = useState('');
  const [roleLoading, setRoleLoading] = useState(false);

  // Estado de Usuario en Sesión
  const [currentUser, setCurrentUser] = useState(null);

  // Cargar usuario en sesión
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && data.user) {
        setCurrentUser(data.user);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('vtex_user_session', JSON.stringify(data.user));
        }
      }
    } catch (e) {
      // Silencioso
    }
  }, []);

  // Cargar lista de usuarios
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (searchTerm) query.set('search', searchTerm);
      if (statusFilter !== 'all') query.set('status', statusFilter);

      const res = await fetch(`/api/users?${query.toString()}`);
      const data = await res.json();

      if (data.success) {
        setUsers(data.data || []);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter]);

  // Cargar catálogo de roles y permisos
  const fetchRolesAndPermissions = useCallback(async () => {
    setIsLoadingRoles(true);
    try {
      const res = await fetch('/api/roles');
      const data = await res.json();
      if (data.success) {
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
        setMatrix(data.matrix || {});
      }
    } catch (err) {
      console.error('Error cargando roles y permisos:', err);
    } finally {
      setIsLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
    fetchRolesAndPermissions();
  }, [fetchCurrentUser, fetchUsers, fetchRolesAndPermissions]);

  // Cambiar estado activo/inactivo con un clic
  const handleToggleActive = async (user) => {
    const newStatus = !user.is_active;
    const defaultRoleName = roles.length > 0 ? roles[0].name : 'Ejecutivo OMS';
    const newRole = !user.role || user.role === 'Pendiente' ? defaultRoleName : user.role;

    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, is_active: newStatus, role: newRole } : u))
    );

    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          is_active: newStatus,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!data.success) fetchUsers();
      else fetchUsers();
    } catch (err) {
      console.error('Error cambiando estado:', err);
      fetchUsers();
    }
  };

  // Cambiar rol directamente en el dropdown
  const handleChangeRole = async (user, newRole) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u))
    );

    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          role: newRole,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
        fetchCurrentUser();
      } else {
        fetchUsers();
      }
    } catch (err) {
      console.error('Error cambiando rol:', err);
      fetchUsers();
    }
  };

  // Toggle permiso en la matriz de roles (RBAC)
  const handleTogglePermission = async (roleId, permissionId, currentAssigned) => {
    const newAssigned = !currentAssigned;

    // Actualización optimista de la matriz local
    setMatrix((prev) => {
      const currentList = prev[roleId] || [];
      const updatedList = newAssigned
        ? [...currentList, permissionId]
        : currentList.filter((id) => id !== permissionId);
      return { ...prev, [roleId]: updatedList };
    });

    try {
      const res = await fetch('/api/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_id: roleId,
          permission_id: permissionId,
          assigned: newAssigned,
        }),
      });
      const data = await res.json();
      if (!data.success) fetchRolesAndPermissions();
    } catch (err) {
      console.error('Error actualizando permiso:', err);
      fetchRolesAndPermissions();
    }
  };

  // Guardar modal de usuario
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim() || !formData.email.trim()) {
      setFormError('Por favor complete los campos obligatorios.');
      return;
    }

    if (!editingUser && (!formData.password || formData.password.length < 6)) {
      setFormError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setFormLoading(true);

    try {
      if (editingUser) {
        const res = await fetch('/api/users', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingUser.id,
            email: editingUser.email,
            name: formData.name.trim(),
            role: formData.role,
            is_active: formData.is_active,
            password: formData.password ? formData.password : undefined,
          }),
        });

        const data = await res.json();
        if (!data.success) {
          setFormError(data.error || 'Error al actualizar usuario.');
          setFormLoading(false);
          return;
        }
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.trim(),
            password: formData.password,
            role: formData.role,
            is_active: formData.is_active,
          }),
        });

        const data = await res.json();
        if (!data.success) {
          setFormError(data.error || 'Error al crear usuario.');
          setFormLoading(false);
          return;
        }
      }

      setIsModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error('Error al guardar:', err);
      setFormError('Error de conexión con el servidor.');
    } finally {
      setFormLoading(false);
    }
  };

  // Guardar nuevo rol
  const handleRoleFormSubmit = async (e) => {
    e.preventDefault();
    setRoleError('');

    if (!newRoleData.name.trim()) {
      setRoleError('Ingrese el nombre del nuevo rol.');
      return;
    }

    setRoleLoading(true);

    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleData.name.trim(),
          description: newRoleData.description.trim(),
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setRoleError(data.error || 'Error al crear rol.');
        setRoleLoading(false);
        return;
      }

      setIsRoleModalOpen(false);
      setNewRoleData({ name: '', description: '' });
      fetchRolesAndPermissions();
    } catch (err) {
      console.error('Error creando rol:', err);
      setRoleError('Error de conexión con el servidor.');
    } finally {
      setRoleLoading(false);
    }
  };

  // Abrir modal de edición de usuario
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role && user.role !== 'Pendiente' ? user.role : (roles[0]?.name || 'Ejecutivo OMS'),
      is_active: Boolean(user.is_active),
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Abrir modal de nuevo usuario
  const handleOpenNew = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      role: roles[0]?.name || 'Ejecutivo OMS',
      is_active: true,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Eliminar usuario
  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      const res = await fetch(`/api/users?id=${deleteConfirmUser.id}&email=${encodeURIComponent(deleteConfirmUser.email)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setDeleteConfirmUser(null);
        fetchUsers();
      }
    } catch (err) {
      console.error('Error al eliminar:', err);
    }
  };

  // Lista de roles disponible (usando BD o fallback)
  const availableRoleNames = roles.length > 0 ? roles.map((r) => r.name) : [
    'Ejecutivo OMS',
    'Administrador Ejecutivo',
    'Auditor de Inventario',
    'Gerencia de Ventas',
  ];

  // Verificar si el usuario actual tiene permisos de administración
  const isUserAdmin =
    !currentUser ||
    currentUser.role === 'Administrador Ejecutivo' ||
    currentUser.permissions?.includes('users:manage') ||
    currentUser.permissions?.includes('*');

  // Función para restaurar rol a Administrador Ejecutivo
  const handleRestoreAdmin = async () => {
    if (!currentUser) return;
    try {
      await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentUser.id,
          email: currentUser.email,
          role: 'Administrador Ejecutivo',
          is_active: true,
        }),
      });
      fetchUsers();
      fetchCurrentUser();
    } catch (e) {
      // Silencioso
    }
  };

  // Agrupar permisos por categoría
  const permissionCategories = Array.from(new Set(permissions.map((p) => p.category || 'General')));

  return (
    <AppLayout>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Warning Banner if user changed their own role away from Admin */}
        {!isUserAdmin && currentUser && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <ShieldAlert size={26} color="#fbbf24" />
              <div>
                <strong style={{ color: '#fbbf24', fontSize: '0.98rem', display: 'block' }}>
                  Aviso de Rol Actualizado: {currentUser.role}
                </strong>
                <span style={{ color: '#cbd5e1', fontSize: '0.86rem' }}>
                  Cambiaste tu rol a <strong>"{currentUser.role}"</strong>. Los usuarios con este rol no tienen permisos para gestionar usuarios ni modificar permisos.
                </span>
              </div>
            </div>
            <button
              onClick={handleRestoreAdmin}
              style={{
                padding: '0.65rem 1.15rem',
                background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(56, 189, 248, 0.3)',
              }}
            >
              👑 Restablecer mi Rol a Administrador Ejecutivo
            </button>
          </div>
        )}

        {/* Header Title Section */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #38bdf8, #3b82f6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 15px rgba(56, 189, 248, 0.3)',
                }}
              >
                <Users size={20} color="#ffffff" />
              </div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                Administración de Usuarios & Permisos RBAC
              </h1>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
              Gestión de cuentas, aprobación de accesos y matriz de permisos por rol en SINSA OMS
            </p>
          </div>

          {/* New User or New Role Action Button */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {activeTab === 'rbac' ? (
              <button
                onClick={() => setIsRoleModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px -4px rgba(168, 85, 247, 0.4)',
                }}
              >
                <Plus size={18} />
                + Crear Nuevo Rol
              </button>
            ) : (
              <button
                onClick={handleOpenNew}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.75rem 1.25rem',
                  background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px -4px rgba(56, 189, 248, 0.4)',
                }}
              >
                <UserPlus size={18} />
                + Nuevo Usuario
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation (Usuarios vs Matriz de Roles RBAC) */}
        <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '0.85rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'users' ? '3px solid #38bdf8' : '3px solid transparent',
              color: activeTab === 'users' ? '#ffffff' : '#94a3b8',
              fontWeight: activeTab === 'users' ? 700 : 500,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Users size={19} color={activeTab === 'users' ? '#38bdf8' : '#94a3b8'} />
            Usuarios & Accesos ({stats.total})
            {stats.pending > 0 && (
              <span style={{ background: '#f59e0b', color: '#0f172a', padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800 }}>
                {stats.pending} pendientes
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('rbac')}
            style={{
              padding: '0.85rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'rbac' ? '3px solid #a855f7' : '3px solid transparent',
              color: activeTab === 'rbac' ? '#ffffff' : '#94a3b8',
              fontWeight: activeTab === 'rbac' ? 700 : 500,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              transition: 'all 0.2s ease',
            }}
          >
            <Key size={19} color={activeTab === 'rbac' ? '#a855f7' : '#94a3b8'} />
            Matriz de Roles & Permisos (RBAC)
          </button>
        </div>

        {/* TAB 1: GESTIÓN DE USUARIOS */}
        {activeTab === 'users' && (
          <>
            {/* Stats Summary Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', background: 'rgba(56, 189, 248, 0.12)', borderRadius: '12px', color: '#38bdf8' }}>
                  <Users size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500, display: 'block' }}>Total Registrados</span>
                  <strong style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>{stats.total}</strong>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', background: 'rgba(16, 185, 129, 0.12)', borderRadius: '12px', color: '#34d399' }}>
                  <UserCheck size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500, display: 'block' }}>Accesos Activos</span>
                  <strong style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>{stats.active}</strong>
                </div>
              </div>

              <div style={{ background: stats.pending > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(16px)', border: stats.pending > 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '12px', color: '#fbbf24' }}>
                  <Clock size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500, display: 'block' }}>Pendientes Aprobación</span>
                  <strong style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.pending > 0 ? '#fbbf24' : '#ffffff' }}>
                    {stats.pending}
                  </strong>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', background: 'rgba(168, 85, 247, 0.12)', borderRadius: '12px', color: '#c084fc' }}>
                  <Shield size={24} />
                </div>
                <div>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500, display: 'block' }}>Administradores</span>
                  <strong style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>{stats.admin}</strong>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar Container */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'Todos', count: stats.total },
                  { id: 'pending', label: '⏳ Pendientes', count: stats.pending, highlight: stats.pending > 0 },
                  { id: 'active', label: '● Activos', count: stats.active },
                  { id: 'inactive', label: '○ Inactivos', count: stats.total - stats.active },
                ].map((tab) => {
                  const isSelected = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id)}
                      style={{
                        padding: '0.5rem 0.95rem',
                        borderRadius: '10px',
                        fontSize: '0.84rem',
                        fontWeight: isSelected ? 700 : 500,
                        border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isSelected
                          ? 'rgba(56, 189, 248, 0.15)'
                          : tab.highlight
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(30, 41, 59, 0.4)',
                        color: isSelected ? '#ffffff' : tab.highlight ? '#fbbf24' : '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      {tab.label}
                      <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: '10px', background: isSelected ? '#38bdf8' : 'rgba(255, 255, 255, 0.1)', color: isSelected ? '#0f172a' : '#cbd5e1', fontWeight: 800 }}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, maxWidth: '380px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={17} color="#64748b" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por correo o nombre..."
                    style={{ width: '100%', padding: '0.55rem 0.85rem 0.55rem 2.4rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', fontSize: '0.86rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <button onClick={fetchUsers} title="Refrescar lista" style={{ padding: '0.55rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Users Table Card */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '1rem 1.25rem' }}>Usuario / Correo</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Rol Asignado</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Acceso (Estado)</th>
                      <th style={{ padding: '1rem 1.25rem' }}>Último Login</th>
                      <th style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Cargando lista de usuarios...</td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>No se encontraron usuarios con los filtros seleccionados.</td>
                      </tr>
                    ) : (
                      users.map((user) => {
                        const isPending = !user.is_active || !user.role || user.role === 'Pendiente';
                        const userInitial = (user.name || user.email || 'U').charAt(0).toUpperCase();

                        return (
                          <tr key={user.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', background: isPending ? 'rgba(245, 158, 11, 0.03)' : 'transparent' }}>
                            <td style={{ padding: '1rem 1.25rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                                <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: isPending ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #38bdf8, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 700, fontSize: '0.95rem', flexShrink: 0 }}>
                                  {userInitial}
                                </div>
                                <div>
                                  <strong style={{ color: '#ffffff', fontSize: '0.92rem', display: 'block' }}>{user.name || 'Sin Nombre'}</strong>
                                  <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{user.email}</span>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: '1rem 1.25rem' }}>
                              <select
                                value={user.role || 'Pendiente'}
                                onChange={(e) => handleChangeRole(user, e.target.value)}
                                style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '10px', color: user.role && user.role !== 'Pendiente' ? '#ffffff' : '#fbbf24', fontSize: '0.82rem', fontWeight: 600, padding: '0.4rem 0.7rem', outline: 'none', cursor: 'pointer' }}
                              >
                                <option value="Pendiente" disabled>⚠️ Sin Rol Asignado</option>
                                {availableRoleNames.map((r) => (
                                  <option key={r} value={r} style={{ background: '#0f172a', color: '#ffffff' }}>{r}</option>
                                ))}
                              </select>
                            </td>

                            <td style={{ padding: '1rem 1.25rem' }}>
                              <button
                                onClick={() => handleToggleActive(user)}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.8rem', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', background: user.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: user.is_active ? '#34d399' : '#fca5a5' }}
                              >
                                {user.is_active ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                                {user.is_active ? 'ACCESO AUTORIZADO' : 'INACTIVO / PENDIENTE'}
                              </button>
                            </td>

                            <td style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                              {user.last_login_at ? new Date(user.last_login_at).toLocaleString('es-NI') : 'Sin inicio reciente'}
                            </td>

                            <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button onClick={() => handleOpenEdit(user)} title="Editar usuario" style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', color: '#38bdf8', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer' }}>
                                  <Edit3 size={16} />
                                </button>
                                <button onClick={() => setDeleteConfirmUser(user)} title="Eliminar usuario" style={{ background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.25)', color: '#f43f5e', borderRadius: '8px', padding: '0.45rem', cursor: 'pointer' }}>
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: MATRIZ DE ROLES Y PERMISOS DINÁMICOS (RBAC) */}
        {activeTab === 'rbac' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Roles Summary Cards Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              {roles.map((role) => {
                const assignedCount = (matrix[role.id] || []).length;
                return (
                  <div
                    key={role.id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      borderRadius: '16px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <h3 style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{role.name}</h3>
                        <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '0.15rem 0.55rem', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800 }}>
                          {assignedCount} / {permissions.length} Permisos
                        </span>
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0, lineHeight: '1.4' }}>
                        {role.description || 'Sin descripción asignada.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive RBAC Matrix Table */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ color: '#ffffff', fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.2rem 0' }}>
                    Matriz Interactiva de Roles y Permisos por Módulo
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: 0 }}>
                    Haz clic en las casillas para conceder o revocar permisos específicos en tiempo real
                  </p>
                </div>
                <button onClick={fetchRolesAndPermissions} title="Refrescar matriz" style={{ padding: '0.55rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <RefreshCw size={17} className={isLoadingRoles ? 'animate-spin' : ''} />
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '1rem 1.25rem', minWidth: '280px' }}>Permiso / Acción Módulo</th>
                      {roles.map((role) => (
                        <th key={role.id} style={{ padding: '1rem 1rem', textAlign: 'center', minWidth: '160px' }}>
                          <span style={{ color: '#ffffff', fontWeight: 700, display: 'block' }}>{role.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingRoles ? (
                      <tr>
                        <td colSpan={roles.length + 1} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                          Cargando matriz de permisos RBAC...
                        </td>
                      </tr>
                    ) : (
                      permissionCategories.map((category) => {
                        const categoryPerms = permissions.filter((p) => (p.category || 'General') === category);
                        return (
                          <React.Fragment key={category}>
                            {/* Category Header Row */}
                            <tr style={{ background: 'rgba(30, 41, 59, 0.3)' }}>
                              <td
                                colSpan={roles.length + 1}
                                style={{ padding: '0.6rem 1.25rem', color: '#38bdf8', fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                              >
                                📁 Categoría: {category}
                              </td>
                            </tr>

                            {/* Permission Rows */}
                            {categoryPerms.map((perm) => (
                              <tr key={perm.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                <td style={{ padding: '0.85rem 1.25rem' }}>
                                  <strong style={{ color: '#ffffff', display: 'block', fontSize: '0.88rem' }}>{perm.name}</strong>
                                  <span style={{ color: '#64748b', fontSize: '0.76rem', fontFamily: 'monospace' }}>{perm.code}</span>
                                </td>

                                {roles.map((role) => {
                                  const isAssigned = (matrix[role.id] || []).includes(perm.id);
                                  return (
                                    <td key={role.id} style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                      <button
                                        onClick={() => handleTogglePermission(role.id, perm.id, isAssigned)}
                                        style={{
                                          width: '32px',
                                          height: '32px',
                                          borderRadius: '8px',
                                          border: isAssigned ? '1px solid rgba(52, 211, 153, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                                          background: isAssigned ? 'rgba(52, 211, 153, 0.2)' : 'rgba(30, 41, 59, 0.4)',
                                          color: isAssigned ? '#34d399' : '#64748b',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={isAssigned ? 'Permiso Concedido (Clic para revocar)' : 'Permiso Revocado (Clic para conceder)'}
                                      >
                                        {isAssigned ? <Check size={18} /> : <X size={16} />}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Crear / Editar Usuario */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '460px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '20px', padding: '1.75rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario Autorizado'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '0.75rem 0.95rem', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Nombre Completo</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Juan Pérez"
                  required
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Correo Electrónico</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="juan.perez@sinsa.com.ni"
                  disabled={!!editingUser}
                  required
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: editingUser ? '#94a3b8' : '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {!editingUser && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Contraseña Inicial</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    required
                    style={{ width: '100%', padding: '0.75rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Rol en la Plataforma</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', background: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                >
                  {availableRoleNames.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
                <input
                  type="checkbox"
                  id="is_active_check"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#38bdf8' }}
                />
                <label htmlFor="is_active_check" style={{ fontSize: '0.86rem', color: '#ffffff', cursor: 'pointer' }}>
                  Acceso Habilitado (Activo)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={formLoading} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #38bdf8, #2563eb)', border: 'none', borderRadius: '10px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                  {formLoading ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Crear Nuevo Rol (RBAC) */}
      {isRoleModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '440px', background: '#0f172a', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '20px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Crear Nuevo Rol Personalizado</h3>
              <button onClick={() => setIsRoleModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {roleError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '0.75rem', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '1rem' }}>
                {roleError}
              </div>
            )}

            <form onSubmit={handleRoleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Nombre del Rol</label>
                <input
                  type="text"
                  value={newRoleData.name}
                  onChange={(e) => setNewRoleData({ ...newRoleData, name: e.target.value })}
                  placeholder="Ej. Auditor Financiero, Supervisor OMS"
                  required
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Descripción del Rol</label>
                <textarea
                  value={newRoleData.description}
                  onChange={(e) => setNewRoleData({ ...newRoleData, description: e.target.value })}
                  placeholder="Describa el alcance o nivel de responsabilidad..."
                  rows={3}
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" onClick={() => setIsRoleModalOpen(false)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={roleLoading} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #a855f7, #7e22ce)', border: 'none', borderRadius: '10px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                  {roleLoading ? 'Creando...' : 'Crear Rol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar Eliminación */}
      {deleteConfirmUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: '#0f172a', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '20px', padding: '1.75rem', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '0.85rem', background: 'rgba(244, 63, 94, 0.15)', borderRadius: '50%', marginBottom: '1rem', color: '#f43f5e' }}>
              <ShieldAlert size={32} />
            </div>
            <h3 style={{ color: '#ffffff', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              ¿Eliminar a {deleteConfirmUser.name || deleteConfirmUser.email}?
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.5rem 0', lineHeight: '1.5' }}>
              Esta acción eliminará el registro de usuario y revocará todos sus accesos al sistema inmediatamente.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeleteConfirmUser(null)} style={{ flex: 1, padding: '0.75rem', background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleDeleteUser} style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, #ef4444, #dc2626)', border: 'none', borderRadius: '10px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}>
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
