
import React, { useState } from 'react';
import { Check, Zap, Cloud, Infinity, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

interface CheckoutPageProps {
    user: { id: number, email: string, name: string };
    onSuccess: () => void; // Chamado para atualizar estado local após pagamento (simulado ou real)
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ user, onSuccess }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleSubscribe = async () => {
        setIsLoading(true);
        try {
            // 1. Cria a preferência no backend
            const { data } = await api.post('/checkout/create-preference', {
                userId: user.id,
                email: user.email
            });

            // 2. Redireciona para o Mercado Pago
            if (data.init_point) {
                window.location.href = data.init_point;
            }
        } catch (error) {
            console.error("Erro no checkout:", error);
            alert("Erro ao iniciar pagamento.");
            setIsLoading(false);
        }
    };

    // Função "Dev" para testar o fluxo sem pagar de verdade (Remover em prod real)
    const handleDevActivation = async () => {
        if (confirm("MODO DEV: Ativar assinatura grátis para teste?")) {
            await api.post('/dev/activate-sub', { userId: user.id });
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-4xl grid md:grid-cols-2 gap-0 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl bg-[#0a0a0a]">
                
                {/* Left: Value Prop */}
                <div className="p-8 md:p-12 flex flex-col justify-between bg-zinc-900/30">
                    <div>
                        <h2 className="text-3xl font-black text-white mb-6 tracking-tighter">DESBLOQUEIE SEU POTENCIAL</h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-green-500/10 rounded border border-green-500/20"><Check className="w-4 h-4 text-green-500" /></div>
                                <div><h4 className="text-white font-bold text-sm">Projetos Ilimitados</h4><p className="text-zinc-500 text-xs">Crie quantas músicas quiser sem restrições.</p></div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-purple-500/10 rounded border border-purple-500/20"><Zap className="w-4 h-4 text-purple-500" /></div>
                                <div><h4 className="text-white font-bold text-sm">AI Mixing & Mastering</h4><p className="text-zinc-500 text-xs">Acesso à nossa IA de engenharia de áudio.</p></div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-blue-500/10 rounded border border-blue-500/20"><Cloud className="w-4 h-4 text-blue-500" /></div>
                                <div><h4 className="text-white font-bold text-sm">Cloud Storage</h4><p className="text-zinc-500 text-xs">Salve seus projetos na nuvem com segurança.</p></div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-orange-500/10 rounded border border-orange-500/20"><Infinity className="w-4 h-4 text-orange-500" /></div>
                                <div><h4 className="text-white font-bold text-sm">Efeitos Premium</h4><p className="text-zinc-500 text-xs">Acesso à suite completa de plugins (Pocket Series).</p></div>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-zinc-800">
                        <div className="flex items-center gap-2 text-zinc-500 text-xs">
                            <ShieldCheck className="w-4 h-4" />
                            Pagamento seguro via Mercado Pago. Cancele quando quiser.
                        </div>
                    </div>
                </div>

                {/* Right: Pricing Card */}
                <div className="p-8 md:p-12 bg-[#050505] flex flex-col items-center justify-center text-center border-l border-zinc-800 relative">
                    <div className="absolute top-0 right-0 bg-white text-black text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">
                        Recomendado
                    </div>

                    <h3 className="text-zinc-400 font-bold uppercase tracking-widest text-sm mb-4">Assinatura Pro</h3>
                    <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-5xl font-black text-white tracking-tighter">R$ 49,90</span>
                        <span className="text-zinc-500 font-medium">/mês</span>
                    </div>
                    <p className="text-zinc-500 text-xs mb-8 max-w-[200px]">
                        Acesso total imediato. Cobrança recorrente mensal.
                    </p>

                    <button 
                        onClick={handleSubscribe}
                        disabled={isLoading}
                        className="w-full py-4 bg-white text-black font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-zinc-200 transition-all shadow-[0_0_30px_rgba(255,255,255,0.15)] mb-4"
                    >
                        {isLoading ? 'Redirecionando...' : 'Assinar Agora'}
                    </button>
                    
                    <button onClick={handleDevActivation} className="text-[10px] text-zinc-700 hover:text-zinc-500 underline">
                        Restaurar compras / Modo Dev
                    </button>
                </div>

            </div>
        </div>
    );
};
