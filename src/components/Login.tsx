/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { authService } from "../lib/firebase";
import { LogIn, Database, Mail, Lock, AlertCircle, Tag } from "lucide-react";
import { motion } from "motion/react";

interface LoginProps {
  onLoginSuccess: (user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Por favor completa todos los campos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const user = await authService.login(email, password);
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al iniciar sesión. Verifica tus credenciales.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await authService.loginWithGoogle();
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al iniciar sesión con Google. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] dark:bg-[#0B1220] flex flex-col items-center justify-center p-4 transition-colors">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white dark:bg-[#111827] border border-[#E2E8F0] dark:border-[#263449] rounded-2xl shadow-sm p-8"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-[#0F172A] dark:bg-[#1E293B] border border-[#1E293B] dark:border-[#334155] p-3 rounded-2xl text-white mb-3 shadow-xs">
            <Tag className="h-8 w-8 text-white" id="login-brand-icon" />
          </div>
          <h1 className="text-2xl font-bold text-[#172033] dark:text-[#F8FAFC] tracking-tight lowercase">dorsalclub</h1>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 text-center font-medium">
            Inventario de streetwear y sneakers
          </p>
        </div>

        {/* Entorno Firebase Conectado */}
        <div className="bg-[#F8FAFC] dark:bg-[#182235] border border-[#E2E8F0] dark:border-[#263449] rounded-xl p-3.5 mb-5">
          <div className="flex items-start space-x-2.5">
            <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-semibold text-[#172033] dark:text-[#F8FAFC]">
                  Entorno Firebase Conectado
                </h3>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                  Activo
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 leading-relaxed">
                Inicia sesión con una cuenta registrada y autorizada en Firebase.
              </p>
            </div>
          </div>
        </div>

        {/* Form Error */}
        {error && (
          <div className="mb-5">
            {error.toLowerCase().includes("unauthorized-domain") || error.toLowerCase().includes("unauthorized domain") ? (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 p-3.5 rounded-xl text-xs space-y-2">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="font-semibold text-amber-900 dark:text-amber-200">Dominio no autorizado en Firebase Auth</div>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  Para Google Sign-In, autoriza el siguiente dominio en la consola de Firebase Authentication:
                </p>
                <div className="bg-white dark:bg-[#0F172A] p-2 rounded-lg border border-amber-200 dark:border-amber-800 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 break-all select-all">
                  {window.location.hostname}
                </div>
              </div>
            ) : (
              <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 px-4 py-3 rounded-xl flex items-start space-x-2.5 text-xs">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Mail className="h-4 w-4 text-[#64748B] dark:text-[#94A3B8]" />
              </span>
              <input
                type="email"
                required
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] dark:focus:border-emerald-500 text-xs sm:text-sm transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                <Lock className="h-4 w-4 text-[#64748B] dark:text-[#94A3B8]" />
              </span>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-[#263449] text-[#172033] dark:text-[#F8FAFC] rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] dark:focus:border-emerald-500 text-xs sm:text-sm transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 bg-[#059669] hover:bg-[#047857] dark:bg-[#059669] dark:hover:bg-[#047857] text-white font-semibold rounded-xl py-3 px-4 transition-all shadow-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            {loading ? (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>Ingresar al Sistema</span>
              </>
            )}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E2E8F0] dark:border-[#263449]"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white dark:bg-[#111827] px-3 text-[#64748B] dark:text-[#94A3B8]">O también</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center space-x-2.5 bg-white dark:bg-[#182235] hover:bg-[#F1F5F9] dark:hover:bg-[#1e2c44] text-[#172033] dark:text-[#F8FAFC] border border-[#E2E8F0] dark:border-[#263449] font-medium rounded-xl py-2.5 px-4 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm shadow-xs"
        >
          <svg className="h-4 w-4 mr-1" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Iniciar sesión con Google</span>
        </button>

        <div className="mt-5 pt-3.5 border-t border-[#E2E8F0] dark:border-[#263449] text-center">
          <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
            © {new Date().getFullYear()} dorsalclub. Todos los derechos reservados.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
