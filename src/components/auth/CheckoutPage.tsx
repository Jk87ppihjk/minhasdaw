import React, { useEffect, useState, useRef } from 'react';
import { Check, Zap, Cloud, Infinity, ShieldCheck, Loader2, Lock, User, Mail, FileText, Smartphone, Copy, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

interface CheckoutPageProps {
    user: { id: number, email: string, name: string };
    onSuccess: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ user, onSuccess }) => {
    // Form State
    const [fullName, setFullName] = useState(user.name || '');
    const [email, setEmail] = useState(user.email || '');
    const [cpf, setCpf] = useState('');
    
    // Logic State
    const [brickReady, setBrickReady] = useState(false);
    const [paymentResult, setPaymentResult] = useState<{ status: 'approved' | 'pending' | 'error', data?: any } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    
    const controllerRef = useRef<any>(null);

    useEffect(() => {
        const loadBrick = async () => {
            // @ts-ignore
            if (!window.MercadoPago) {
                console.error("SDK Mercado Pago not loaded");
                return;
            }

            const publicKey = process.env.MP_PUBLIC_KEY;
            if (!publicKey) {
                console.error("MP_PUBLIC_KEY missing");
                setErrorMsg("Erro de configuração: Chave pública não encontrada.");
                return;
            }

            // @ts-ignore
            const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
            const bricksBuilder = mp.bricks();

            const settings = {
                initialization: {
                    amount: 49.90, // Preço fixo da assinatura
                    payer: {
                        email: user.email || "guest@monochrome.studio",
                    },
                },
                customization: {
                    visual: {
                        style: {
                            theme: 'dark', // Tema escuro nativo do MP
                        }
                    },
                    paymentMethods: {
                        creditCard: "all",
                        bankTransfer: "all",
                        maxInstallments: 12
                    },
                },
                callbacks: {
                    onReady: () => {
                        setBrickReady(true);
                        setErrorMsg('');
                    },
                    onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
                        // Validação Manual dos campos externos ao Brick
                        if (!fullName || !email || !cpf || cpf.length < 11) {
                            alert("Por favor, preencha seus dados pessoais (Nome, Email, CPF) no formulário acima antes de pagar.");
                            // Rejeita a promise para o Brick saber que houve erro e parar o loading interno
                            return new Promise((resolve, reject) => reject());
                        }

                        setIsProcessing(true);
                        setErrorMsg('');

                        try {
                            const cleanCpf = cpf.replace(/\D/g, '');
                            
                            const payload = {
                                transaction_amount: formData.transaction_amount,
                                description: "Monochrome Studio Pro",
                                payment_method_id: formData.payment_method_id,
                                email: email,
                                identification: {
                                    type: 'CPF',
                                    number: cleanCpf
                                },
                                token: formData.token,
                                installments: formData.installments,
                                issuer_id: formData.issuer_id,
                            };

                            // ROTA CORRETA DO BACKEND (Payment Brick)
                            const { data } = await api.post('/checkout/process_payment', payload);

                            if (data.status === 'APPROVED') {
                                setPaymentResult({ status: 'approved' });
                                setTimeout(() => onSuccess(), 3000); 
                            } else if (data.status === 'PENDING' && formData.payment_method_id === 'pix') {
                                setPaymentResult({ 
                                    status: 'pending', 
                                    data: {
                                        qrCodeBase64: data.qrCodeBase64,
                                        qrCodeText: data.qrCodeText
                                    }
                                });
                            } else {
                                setErrorMsg("Pagamento recusado ou em análise. Verifique os dados.");
                            }
                            setIsProcessing(false);

                        } catch (error: any) {
                            console.error(error);
                            setIsProcessing(false);
                            const msg = error.response?.data?.message || error.message || "Falha na comunicação.";
                            setErrorMsg(`Erro ao processar: ${msg}`);
                        }
                    },
                    onError: (error: any) => {
                        console.error("Brick Error:", error);
                        setErrorMsg("Erro interno do módulo de pagamento.");
                    },
                },
            };

            const container = document.getElementById('paymentBrick_container');
            if (container) container.innerHTML = ''; 
            
            try {
                controllerRef.current = await bricksBuilder.create("payment", "paymentBrick_container", settings);
            } catch (e) {
                console.error("Brick Create Error", e);
            }
        };

        const timer = setTimeout(loadBrick, 500);
        return () => clearTimeout(timer);
    }, [user]);

    const handleDevActivation = async () => {
        if (confirm("MODO DEV: Ativar assinatura grátis? (Apenas para testes)")) {
            await api.post('/dev/activate-sub', { userId: user.id });
            window.location.reload();
        }
    };

    return (
        <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-4 overflow-y-auto z-[200]">
            
            {/* Main Card Container */}
            <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-0 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl bg-[#0a0a0a] min-h-[650px]">
                
                {/* LEFT: Features & Value Proposition */}
                <div className="p-8 md:p-12 flex flex-col justify-between bg-zinc-900/30 border-r border-zinc-800 relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-900/50 via-transparent to-transparent pointer-events-none" />
                    
                    <div className="relative z-10">
                        <h2 className="text-4xl font-black text-white mb-8 tracking-tighter leading-[0.9]">
                            DESBLOQUEIE SEU<br/>
                            <span className="text-yellow-500">POTENCIAL</span>
                        </h2>
                        
                        <div className="space-y-6">
                            <div className="flex items-start gap-4 group">
                                <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20 group-hover:border-yellow-500/50 transition-colors">
                                    <Check className="w-5 h-5 text-yellow-500" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-sm">Projetos Ilimitados</h4>
                                    <p className="text-zinc-500 text-xs mt-0.5">Crie quantas músicas quiser sem restrições.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 group">
                                <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20 group-hover:border-yellow-500/50 transition-colors">
                                    <Zap className="w-5 h-5 text-yellow-500" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-sm">AI Mixing & Mastering</h4>
                                    <p className="text-zinc-500 text-xs mt-0.5">Acesso à nossa IA de engenharia de áudio.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 group">
                                <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20 group-hover:border-yellow-500/50 transition-colors">
                                    <Cloud className="w-5 h-5 text-yellow-500" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-sm">Cloud Storage</h4>
                                    <p className="text-zinc-500 text-xs mt-0.5">Salve seus projetos na nuvem com segurança.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 group">
                                <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20 group-hover:border-yellow-500/50 transition-colors">
                                    <Infinity className="w-5 h-5 text-yellow-500" />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold text-sm">Efeitos Premium</h4>
                                    <p className="text-zinc-500 text-xs mt-0.5">Acesso à suite completa de plugins (Pocket Series).</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 pt-8 border-t border-zinc-800 mt-8 flex justify-between items-end">
                        <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-mono uppercase tracking-wide">
                            <ShieldCheck className="w-4 h-4" />
                            Pagamento seguro via Mercado Pago
                        </div>
                        <button onClick={handleDevActivation} className="text-[9px] text-zinc-800 hover:text-zinc-600 font-mono">
                            Modo Dev
                        </button>
                    </div>
                </div>

                {/* RIGHT: Dynamic Checkout Form */}
                <div className="bg-[#050505] flex flex-col relative">
                    
                    {/* Header Strip */}
                    <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-[#080808]">
                        <div>
                            <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Assinatura Pro</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-yellow-500">R$ 49,90</span>
                                <span className="text-zinc-500 text-xs">/mês</span>
                            </div>
                        </div>
                        <div className="h-8 w-8 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                            <Lock className="w-4 h-4 text-zinc-500" />
                        </div>
                    </div>

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
                        
                        {/* Error Message */}
                        {errorMsg && (
                            <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded flex items-center gap-2 text-red-400 text-xs">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {errorMsg}
                            </div>
                        )}

                        {/* SUCCESS OVERLAY */}
                        {paymentResult?.status === 'approved' && (
                            <div className="absolute inset-0 bg-[#050505] z-50 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(34,197,94,0.4)]">
                                    <Check className="w-10 h-10 text-black" />
                                </div>
                                <h3 className="text-2xl font-bold text-white">Pagamento Aprovado!</h3>
                                <p className="text-zinc-500 text-sm mt-2">Iniciando seu estúdio...</p>
                            </div>
                        )}

                        {/* PIX OVERLAY */}
                        {paymentResult?.status === 'pending' && paymentResult.data && (
                            <div className="absolute inset-0 bg-[#050505] z-50 flex flex-col items-center p-8 animate-in fade-in slide-in-from-bottom-10">
                                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                                    <Smartphone className="w-5 h-5 text-yellow-500" />
                                    Pagamento via PIX
                                </h3>
                                <div className="bg-white p-3 rounded-xl mb-6 shadow-xl">
                                    <img src={`data:image/png;base64,${paymentResult.data.qrCodeBase64}`} className="w-48 h-48 mix-blend-multiply" alt="QR Code" />
                                </div>
                                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 mb-6">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">Copia e Cola</label>
                                    <div className="flex gap-2">
                                        <input readOnly value={paymentResult.data.qrCodeText} className="flex-1 bg-black rounded border border-zinc-800 px-3 text-xs text-zinc-300 font-mono outline-none" />
                                        <button onClick={() => { navigator.clipboard.writeText(paymentResult.data.qrCodeText); alert("Copiado!"); }} className="p-2 hover:bg-zinc-800 rounded text-white"><Copy className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                <button onClick={onSuccess} className="w-full py-3 bg-yellow-500 text-black font-bold text-xs uppercase tracking-widest rounded-lg hover:bg-yellow-400 transition-colors shadow-[0_0_15px_rgba(234,179,8,0.3)]">
                                    Já realizei o pagamento
                                </button>
                            </div>
                        )}

                        {/* User Inputs Section */}
                        <div className="mb-8 space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3" /> Nome Completo</label>
                                    <input 
                                        type="text" 
                                        value={fullName} onChange={(e) => setFullName(e.target.value)}
                                        className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500/50 outline-none transition-colors"
                                        placeholder="Seu nome"
                                    />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1"><FileText className="w-3 h-3" /> CPF</label>
                                    <input 
                                        type="text" 
                                        value={cpf} onChange={(e) => setCpf(e.target.value)}
                                        className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500/50 outline-none transition-colors"
                                        placeholder="000.000.000-00"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
                                <input 
                                    type="email" 
                                    value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-[#111] border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:border-yellow-500/50 outline-none transition-colors"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="h-[1px] bg-zinc-800 flex-1"></div>
                            <span className="text-[10px] text-zinc-600 font-bold uppercase">Dados de Pagamento</span>
                            <div className="h-[1px] bg-zinc-800 flex-1"></div>
                        </div>

                        {/* Loading Spinner */}
                        {(!brickReady || isProcessing) && (
                            <div className="absolute inset-0 bg-[#050505]/90 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
                                <span className="text-zinc-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                                    {isProcessing ? 'Processando Pagamento...' : 'Carregando Checkout Seguro...'}
                                </span>
                            </div>
                        )}

                        {/* Payment Brick Container */}
                        <div id="paymentBrick_container" className="min-h-[400px]"></div>

                    </div>
                </div>
            </div>
        </div>
    );
};