
import React, { useState } from 'react';
import { Music, ArrowRight, Loader2, Mail, Lock, User } from 'lucide-react';
import { api } from '../../services/api';

interface AuthPageProps {
    onLogin: (user: any, token: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLogin }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const { data } = await api.post(endpoint, formData);
            
            localStorage.setItem('monochrome_token', data.token);
            onLogin(data.user, data.token);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Ocorreu um erro. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-4">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-2xl p-8 relative z-10 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                        <Music className="w-6 h-6 text-black" />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">MONOCHROME STUDIO</h1>
                    <p className="text-zinc-500 text-sm text-center">
                        {isLogin ? 'Entre para continuar produzindo.' : 'Crie sua conta e comece agora.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {!isLogin && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Nome</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                                <input 
                                    type="text" 
                                    required={!isLogin}
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-[#111] border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-white transition-colors"
                                    placeholder="Seu nome artístico"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                            <input 
                                type="email" 
                                required
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                                className="w-full bg-[#111] border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-white transition-colors"
                                placeholder="produtor@exemplo.com"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Senha</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                            <input 
                                type="password" 
                                required
                                value={formData.password}
                                onChange={e => setFormData({...formData, password: e.target.value})}
                                className="w-full bg-[#111] border border-zinc-800 rounded-lg py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-white transition-colors"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-xs text-center">
                            {error}
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="mt-2 w-full bg-white text-black font-bold py-3 rounded-lg text-sm uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (isLogin ? 'Entrar' : 'Criar Conta')}
                        {!isLoading && <ArrowRight className="w-4 h-4" />}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button 
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-zinc-500 text-xs hover:text-white transition-colors underline"
                    >
                        {isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Fazer Login'}
                    </button>
                </div>
            </div>
        </div>
    );
};
