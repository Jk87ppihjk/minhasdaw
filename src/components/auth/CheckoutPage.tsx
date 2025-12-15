import React, { useEffect, useState } from 'react';
import { Check, Zap, Cloud, Infinity, ShieldCheck, Loader2, CreditCard } from 'lucide-react';
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

            // USANDO VARIÁVEL DE AMBIENTE (Mais Seguro)
            const publicKey = process.env.MP_PUBLIC_KEY;

            if (!publicKey) {
                console.error("ERRO: MP_PUBLIC_KEY não encontrada nas variáveis de ambiente.");
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
                            theme: 'dark', // Tema escuro para combinar com Monochrome
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
                                setTimeout(() => onSuccess(), 2000); 
                            } else if (data.status === 'PENDING' && data.qrCodeBase64) {
                                setPixData({
                                    qrCodeBase64: data.qrCodeBase64,
                                    qrCodeText: data.qrCodeText
                                });
                                setPaymentStatus('pending');
                            } else {
                                setPaymentStatus('error');
                                alert("Pagamento recusado: " + (data.message || 'Verifique os dados.'));
                            }

                        } catch (error) {
                            console.error(error);
                            setPaymentStatus('error');
                            alert("Erro de comunicação com o servidor.");
                        }
                    },
                    onError: (error: any) => {
                        console.error(error);
                    },
                },
            };

            const container = document.getElementById('paymentBrick_container');
            if (container) container.innerHTML = '';

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
        <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-5xl grid md:grid-cols-2 gap-0 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl bg-[#0a0a0a]">
                
                {/* Left: Value Prop */}
                <div className="p-8 md:p-12 flex flex-col justify-between bg-zinc-900/30 border-r border-zinc-800">
                    <div>
                        <h2 className="text-3xl font-black text-white mb-6 tracking-tighter">ASSINATURA PRO</h2>
                        <div className="space-y-4 mb-8">
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-white/10 rounded border border-white/20"><Check className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">Projetos Ilimitados</h4><p className="text-zinc-500 text-xs">Sem limites para sua criatividade.</p></div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-white/10 rounded border border-white/20"><Zap className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">AI Mixing & Mastering</h4><p className="text-zinc-500 text-xs">Engenharia de áudio automática.</p></div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-white/10 rounded border border-white/20"><Cloud className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">Cloud Storage</h4><p className="text-zinc-500 text-xs">Backup seguro na nuvem.</p></div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="p-1 bg-white/10 rounded border border-white/20"><Infinity className="w-4 h-4 text-white" /></div>
                                <div><h4 className="text-white font-bold text-sm">Plugins Premium</h4><p className="text-zinc-500 text-xs">Acesso à Pocket Series completa.</p></div>
                            </div>
                        </div>
                        
                        <div className="bg-[#050505] p-6 rounded-xl border border-zinc-800 text-center">
                            <span className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Total a pagar</span>
                            <div className="text-4xl font-black text-white mt-1">R$ 49,90</div>
                            <span className="text-zinc-600 text-[10px]">/mês</span>
                        </div>
                    </div>
                    
                    <div className="mt-8 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-zinc-500 text-xs">
                            <ShieldCheck className="w-4 h-4" />
                            Ambiente Seguro
                        </div>
                        <button onClick={handleDevActivation} className="text-[9px] text-zinc-800 hover:text-zinc-600 font-mono">
                            dev_bypass
                        </button>
                    </div>
                </div>

                {/* Right: Payment Brick */}
                <div className="bg-[#0a0a0a] relative flex flex-col">
                    
                    {/* Loading State Overlay */}
                    {(!brickReady || paymentStatus === 'processing') && (
                        <div className="absolute inset-0 bg-[#0a0a0a]/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                            <span className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
                                {paymentStatus === 'processing' ? 'Processando Pagamento...' : 'Carregando Checkout...'}
                            </span>
                        </div>
                    )}

                    {/* Success State */}
                    {paymentStatus === 'approved' && (
                        <div className="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col items-center justify-center gap-6 p-8 text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.4)]">
                                <Check className="w-10 h-10 text-black" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">Pagamento Aprovado!</h3>
                                <p className="text-zinc-500 text-sm">Bem-vindo ao Monochrome Pro. Redirecionando...</p>
                            </div>
                        </div>
                    )}

                    {/* Pix State */}
                    {paymentStatus === 'pending' && pixData && (
                        <div className="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300 overflow-y-auto">
                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                Aguardando PIX
                            </h3>
                            
                            <div className="bg-white p-2 rounded-lg mb-6">
                                <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48" />
                            </div>

                            <div className="w-full bg-zinc-900 border border-zinc-800 rounded p-3 mb-4">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1 text-left">Copia e Cola</p>
                                <input 
                                    type="text" 
                                    readOnly 
                                    value={pixData.qrCodeText} 
                                    className="w-full bg-transparent text-zinc-300 text-xs font-mono outline-none truncate"
                                    onClick={(e) => e.currentTarget.select()}
                                />
                            </div>

                            <button 
                                onClick={onSuccess} 
                                className="bg-white text-black px-6 py-3 rounded-lg font-bold text-xs uppercase tracking-widest hover:bg-zinc-200 transition-colors w-full"
                            >
                                Já realizei o pagamento
                            </button>
                        </div>
                    )}

                    {/* Brick Container */}
                    <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar">
                        <div id="paymentBrick_container"></div>
                    </div>
                </div>

            </div>
        </div>
    );
};