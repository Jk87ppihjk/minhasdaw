import React, { useEffect, useState, useRef } from 'react';
import { ShieldCheck, Loader2, Copy, CheckCircle, Lock, Zap } from 'lucide-react';
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
    
    // Payment State
    const [loading, setLoading] = useState(false);
    const [brickReady, setBrickReady] = useState(false);
    const [paymentResult, setPaymentResult] = useState<{ status: 'approved' | 'pending' | 'error', data?: any } | null>(null);
    
    const controllerRef = useRef<any>(null);

    useEffect(() => {
        const loadBrick = async () => {
            // @ts-ignore
            if (!window.MercadoPago) {
                console.error("SDK Mercado Pago não carregado.");
                return;
            }

            const publicKey = process.env.MP_PUBLIC_KEY;
            if (!publicKey) {
                alert("Erro de Configuração: MP_PUBLIC_KEY ausente.");
                return;
            }

            // @ts-ignore
            const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
            const bricksBuilder = mp.bricks();

            const settings = {
                initialization: {
                    amount: 49.90,
                    payer: {
                        email: "dummy_init@test.com", // Dummy email for init, we override on submit
                    },
                },
                customization: {
                    visual: {
                        style: {
                            theme: 'dark', // Keeping dark theme to match app
                        }
                    },
                    paymentMethods: {
                        creditCard: "all",
                        bankTransfer: "all",
                        maxInstallments: 12
                    },
                },
                callbacks: {
                    onReady: () => setBrickReady(true),
                    onSubmit: async ({ selectedPaymentMethod, formData }: any) => {
                        // 1. Validate Manual Form
                        if (!fullName || !email || !cpf || cpf.length < 11) {
                            alert("Por favor, preencha seus dados (Nome, Email e CPF) na seção 1 antes de pagar.");
                            // Reject the promise to stop the brick loading spinner if possible, 
                            // though Brick API doesn't always support cancellation easily in onSubmit.
                            return new Promise((resolve, reject) => reject());
                        }

                        setLoading(true);

                        try {
                            // 2. Prepare Payload for Existing Backend
                            const cleanCpf = cpf.replace(/\D/g, '');
                            
                            const payload = {
                                transaction_amount: formData.transaction_amount,
                                description: "Monochrome Studio Pro",
                                payment_method_id: formData.payment_method_id,
                                email: email, // Use manual input email
                                identification: {
                                    type: 'CPF',
                                    number: cleanCpf
                                },
                                token: formData.token,
                                installments: formData.installments,
                                issuer_id: formData.issuer_id,
                            };

                            // 3. Send to Backend
                            const { data } = await api.post('/checkout/process_payment', payload);

                            setLoading(false);

                            if (data.status === 'APPROVED') {
                                setPaymentResult({ status: 'approved' });
                                setTimeout(onSuccess, 3000);
                            } else if (data.status === 'PENDING' && formData.payment_method_id === 'pix') {
                                setPaymentResult({ 
                                    status: 'pending', 
                                    data: {
                                        qrCodeBase64: data.qrCodeBase64,
                                        qrCodeText: data.qrCodeText
                                    }
                                });
                            } else {
                                alert("Pagamento não aprovado. Tente outro meio.");
                            }

                        } catch (error: any) {
                            console.error(error);
                            setLoading(false);
                            alert("Erro ao processar: " + (error.response?.data?.message || error.message));
                        }
                    },
                    onError: (error: any) => console.error("Brick Error:", error),
                },
            };

            const container = document.getElementById('paymentBrick_container');
            if (container) container.innerHTML = ''; 
            
            controllerRef.current = await bricksBuilder.create("payment", "paymentBrick_container", settings);
        };

        // Small delay to ensure DOM is ready
        setTimeout(loadBrick, 100);
        
        return () => {
            // Cleanup if needed
        };
    }, []);

    // --- RENDER PIX VIEW ---
    if (paymentResult?.status === 'pending' && paymentResult.data) {
        return (
            <div className="fixed inset-0 bg-[#050505] flex items-center justify-center p-4 overflow-y-auto z-[200]">
                <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-xl p-8 text-center animate-in zoom-in-95">
                    <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Zap className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Pagamento PIX Gerado!</h3>
                    <p className="text-zinc-500 text-sm mb-6">Escaneie o QR Code abaixo no app do seu banco.</p>
                    
                    <div className="bg-white p-2 rounded-lg mb-6 inline-block">
                        <img 
                            src={`data:image/png;base64,${paymentResult.data.qrCodeBase64}`} 
                            alt="QR Code Pix" 
                            className="w-48 h-48 mix-blend-multiply" 
                        />
                    </div>

                    <div className="mb-6 text-left">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Copia e Cola</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                readOnly 
                                value={paymentResult.data.qrCodeText} 
                                className="flex-1 bg-[#111] border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 font-mono outline-none truncate"
                            />
                            <button 
                                onClick={() => {
                                    navigator.clipboard.writeText(paymentResult.data.qrCodeText);
                                    alert("Código copiado!");
                                }}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <button 
                        onClick={onSuccess} 
                        className="w-full bg-white text-black font-bold py-3 rounded-lg text-sm uppercase tracking-widest hover:bg-gray-200 transition-colors"
                    >
                        Já realizei o pagamento
                    </button>
                </div>
            </div>
        );
    }

    // --- RENDER SUCCESS VIEW ---
    if (paymentResult?.status === 'approved') {
        return (
            <div className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[200]">
                <div className="text-center animate-in zoom-in duration-300">
                    <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(34,197,94,0.5)]">
                        <CheckCircle className="w-12 h-12 text-black" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-2">Pagamento Aprovado!</h2>
                    <p className="text-zinc-500 animate-pulse">Iniciando Monochrome Studio...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-[#050505] overflow-y-auto z-[150] custom-scrollbar">
            
            {/* Loading Overlay */}
            {loading && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[250] flex flex-col items-center justify-center animate-in fade-in">
                    <Loader2 className="w-10 h-10 text-white animate-spin mb-4" />
                    <h3 className="text-white font-bold text-lg">Processando Pagamento...</h3>
                    <p className="text-zinc-500 text-sm">Aguarde a confirmação do banco.</p>
                </div>
            )}

            <div className="max-w-3xl mx-auto p-4 md:p-8">
                
                {/* Header */}
                <header className="mb-8 border-b border-zinc-800 pb-4 mt-4 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-zinc-400">
                        <ShieldCheck className="w-5 h-5" />
                        <h1 className="text-xl font-bold tracking-tight text-white">Checkout Seguro</h1>
                    </div>
                </header>

                {/* Product Summary */}
                <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-xl shadow-lg mb-6 flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-20 h-20 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 shrink-0">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                            <span className="font-black text-black">M</span>
                        </div>
                    </div>
                    <div className="text-center sm:text-left">
                        <h2 className="font-bold text-xl text-white">Monochrome Studio Pro</h2>
                        <p className="text-zinc-500 text-sm mb-1">Acesso ilimitado, AI Mixing, Cloud Storage.</p>
                        <p className="text-white font-black text-2xl">R$ 49,90 <span className="text-xs font-normal text-zinc-500">/mês</span></p>
                    </div>
                </div>

                {/* Section 1: Data */}
                <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-xl shadow-lg mb-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-zinc-700"></div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs flex items-center justify-center border border-zinc-700">1</span>
                        Seus Dados
                    </h3>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Nome Completo</label>
                            <input 
                                type="text" 
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full rounded-lg bg-[#111] border border-zinc-800 p-3 text-white outline-none focus:border-white transition-colors placeholder-zinc-700" 
                                placeholder="Como no seu documento" 
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">E-mail</label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg bg-[#111] border border-zinc-800 p-3 text-white outline-none focus:border-white transition-colors placeholder-zinc-700" 
                                placeholder="seu@email.com" 
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">CPF</label>
                            <input 
                                type="text" 
                                value={cpf}
                                onChange={(e) => setCpf(e.target.value)}
                                className="w-full rounded-lg bg-[#111] border border-zinc-800 p-3 text-white outline-none focus:border-white transition-colors placeholder-zinc-700" 
                                placeholder="000.000.000-00" 
                            />
                        </div>
                    </div>
                </div>

                {/* Section 2: Payment Brick */}
                <div className="bg-[#0a0a0a] border border-zinc-800 p-6 rounded-xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-white"></div>
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-white text-black text-xs flex items-center justify-center font-bold">2</span>
                        Pagamento
                    </h3>
                    
                    <div className="min-h-[300px]">
                        {!brickReady && (
                            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                <span className="text-xs uppercase tracking-widest">Carregando Checkout...</span>
                            </div>
                        )}
                        <div id="paymentBrick_container"></div>
                    </div>
                </div>

                <div className="text-center mt-8 text-zinc-600 text-xs flex items-center justify-center gap-2">
                    <Lock className="w-3 h-3" />
                    Ambiente criptografado e seguro.
                </div>

            </div>
        </div>
    );
};