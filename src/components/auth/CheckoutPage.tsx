import React, { useEffect, useState } from 'react';
import { Check, Zap, Cloud, Infinity, ShieldCheck, Loader2, Lock } from 'lucide-react';
import { api } from '../../services/api';

interface CheckoutPageProps {
    user: { id: number, email: string, name: string };
    onSuccess: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ user, onSuccess }) => {
    const [brickReady, setBrickReady] = useState(false);
    const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'approved' | 'pending' | 'error'>('idle');
    const [pixData, setPixData] = useState<{ qrCodeBase64: string, qrCodeText: string } | null>(null);

    useEffect(() => {
        const loadBrick = async () => {
            // @ts-ignore
            if (!window.MercadoPago) {
                console.error("SDK Mercado Pago não carregado.");
                return;
            }

            // Chave pública segura injetada pelo Vite
            const publicKey = process.env.MP_PUBLIC_KEY;

            if (!publicKey) {
                console.error("ERRO: MP_PUBLIC_KEY ausente. Verifique o .env");
                setPaymentStatus('error');
                return;
            }

            // @ts-ignore
            const mp = new window.MercadoPago(publicKey, {
                locale: 'pt-BR'
            });
            
            const bricksBuilder = mp.bricks();

            const settings = {
                initialization: {
                    amount: 49.90,
                    payer: {
                        email: user.email,
                    },
                },
                customization: {
                    visual: {
                        style: {
                            theme: 'dark', // Tema escuro para combinar com a DAW
                        }
                    },
                    paymentMethods: {
                        creditCard: "all",
                        bankTransfer: "all", // Pix
                        maxInstallments: 12
                    },
                },
                callbacks: {
                    onReady: () => {
                        setBrickReady(true);
                    },
                    onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
                        setPaymentStatus('processing');
                        
                        try {
                            // Monta o payload para o backend
                            const payload = {
                                transaction_amount: formData.transaction_amount,
                                description: "Monochrome Studio Pro",
                                payment_method_id: formData.payment_method_id,
                                email: formData.payer.email,
                                identification: formData.payer.identification,
                                token: formData.token,
                                installments: formData.installments,
                                issuer_id: formData.issuer_id,
                            };

                            const { data } = await api.post('/checkout/process_payment', payload);

                            if (data.status === 'APPROVED') {
                                setPaymentStatus('approved');
                                // Aguarda 2s para mostrar sucesso e redireciona (libera acesso)
                                setTimeout(() => onSuccess(), 2000); 
                            } else if (data.status === 'PENDING' && data.qrCodeBase64) {
                                // Caso seja Pix
                                setPixData({
                                    qrCodeBase64: data.qrCodeBase64,
                                    qrCodeText: data.qrCodeText
                                });
                                setPaymentStatus('pending');
                            } else {
                                setPaymentStatus('error');
                                alert("Pagamento não aprovado: " + (data.message || 'Verifique os dados.'));
                            }

                        } catch (error) {
                            console.error(error);
                            setPaymentStatus('error');
                            alert("Erro de comunicação com o servidor.");
                        }
                    },
                    onError: (error: any) => {
                        console.error("Brick Error:", error);
                    },
                },
            };

            const container = document.getElementById('paymentBrick_container');
            if (container) container.innerHTML = ''; // Limpa container anterior

            await bricksBuilder.create("payment", "paymentBrick_container", settings);
        };

        const timer = setTimeout(loadBrick, 500);
        return () => clearTimeout(timer);
    }, [user]);

    const handleDevActivation = async () => {
        if (confirm("MODO DEV: Ativar assinatura grátis para teste?")) {
            await api.post('/dev/activate-sub', { userId: user.id });
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-4 overflow-y-auto z-[200]">
            <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-0 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl bg-[#0a0a0a]">
                
                {/* Left: Value Proposition */}
                <div className="p-8 md:p-12 flex flex-col justify-between bg-zinc-900/30 border-r border-zinc-800 relative overflow-hidden">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-700 via-[#050505] to-[#050505]"></div>
                    
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-6">
                            <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                                <Lock className="w-4 h-4 text-black" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Checkout Seguro</span>
                        </div>

                        <h2 className="text-4xl font-black text-white mb-6 tracking-tighter leading-tight">
                            DESBLOQUEIE SEU<br/>
                            <span className="text-zinc-500">POTENCIAL CRIATIVO</span>
                        </h2>
                        
                        <div className="space-y-5 mb-8">
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-white/30 transition-colors"><Check className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">Projetos Ilimitados</h4><p className="text-zinc-500 text-xs">Crie sem restrições.</p></div>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-white/30 transition-colors"><Zap className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">AI Mixing & Mastering</h4><p className="text-zinc-500 text-xs">Mixagem profissional em segundos.</p></div>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-white/30 transition-colors"><Cloud className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">Cloud Storage</h4><p className="text-zinc-500 text-xs">Seus projetos salvos na nuvem.</p></div>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <div className="p-2 bg-white/5 rounded-lg border border-white/10 group-hover:border-white/30 transition-colors"><Infinity className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">Plugins Premium</h4><p className="text-zinc-500 text-xs">Acesso à Pocket Series completa.</p></div>
                            </div>
                        </div>
                        
                        <div className="bg-[#050505] p-6 rounded-xl border border-zinc-800 relative overflow-hidden group hover:border-zinc-600 transition-colors">
                            <div className="flex justify-between items-end relative z-10">
                                <div>
                                    <span className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Plano Pro Mensal</span>
                                    <div className="text-4xl font-black text-white mt-1">R$ 49,90</div>
                                </div>
                                <span className="text-zinc-600 text-[10px] bg-zinc-900 px-2 py-1 rounded">Cobrança recorrente</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-8 flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-2 text-zinc-500 text-[10px] uppercase tracking-wider">
                            <ShieldCheck className="w-4 h-4" />
                            Pagamento via Mercado Pago
                        </div>
                        <button onClick={handleDevActivation} className="text-[9px] text-zinc-800 hover:text-zinc-600 font-mono">
                            developer_bypass_mode
                        </button>
                    </div>
                </div>

                {/* Right: Payment Brick Container */}
                <div className="bg-[#0a0a0a] relative flex flex-col min-h-[600px]">
                    
                    {/* Loading State Overlay */}
                    {(!brickReady || paymentStatus === 'processing') && (
                        <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4 transition-all">
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                            <span className="text-zinc-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                                {paymentStatus === 'processing' ? 'Processando Pagamento...' : 'Carregando Checkout Seguro...'}
                            </span>
                        </div>
                    )}

                    {/* Error State */}
                    {paymentStatus === 'error' && (
                        <div className="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col items-center justify-center gap-4 text-center p-8">
                            <div className="w-16 h-16 bg-red-900/20 rounded-full flex items-center justify-center border border-red-900/50">
                                <ShieldCheck className="w-8 h-8 text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white">Erro no Pagamento</h3>
                            <p className="text-zinc-500 text-sm">Verifique sua conexão ou tente novamente.</p>
                            <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-white text-black font-bold rounded hover:bg-zinc-200">Tentar Novamente</button>
                        </div>
                    )}

                    {/* Success State */}
                    {paymentStatus === 'approved' && (
                        <div className="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col items-center justify-center gap-6 p-8 text-center animate-in fade-in zoom-in duration-500">
                            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(34,197,94,0.5)]">
                                <Check className="w-12 h-12 text-black" />
                            </div>
                            <div>
                                <h3 className="text-3xl font-black text-white mb-2 tracking-tight">Pagamento Aprovado!</h3>
                                <p className="text-zinc-500 text-sm uppercase tracking-widest">Iniciando Monochrome Studio...</p>
                            </div>
                        </div>
                    )}

                    {/* Pix State */}
                    {paymentStatus === 'pending' && pixData && (
                        <div className="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300 overflow-y-auto">
                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                Pague via PIX
                            </h3>
                            
                            <div className="bg-white p-2 rounded-lg mb-8 shadow-2xl">
                                <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code Pix" className="w-56 h-56 mix-blend-multiply" />
                            </div>

                            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold">Código Copia e Cola</p>
                                    <button onClick={() => navigator.clipboard.writeText(pixData.qrCodeText)} className="text-[10px] text-white hover:underline">Copiar</button>
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        readOnly 
                                        value={pixData.qrCodeText} 
                                        className="flex-1 bg-black/50 rounded border border-zinc-800 p-2 text-zinc-300 text-xs font-mono outline-none truncate"
                                        onClick={(e) => e.currentTarget.select()}
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={onSuccess} 
                                className="bg-white text-black px-8 py-3 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                            >
                                Já realizei o pagamento
                            </button>
                        </div>
                    )}

                    {/* Brick Container */}
                    <div className="p-6 md:p-12 flex-1 overflow-y-auto custom-scrollbar">
                        <div id="paymentBrick_container"></div>
                    </div>
                </div>

            </div>
        </div>
    );
};