import React, { useEffect, useState } from 'react';
import { Check, Zap, Cloud, Infinity, ShieldCheck, Loader2, Lock, X } from 'lucide-react';
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

            // A chave pública deve vir do .env via vite.config.ts
            // A IA precisa garantir que você tenha a chave: MP_PUBLIC_KEY
            const publicKey = process.env.MP_PUBLIC_KEY; 

            if (!publicKey) {
                console.error("ERRO CRÍTICO: MP_PUBLIC_KEY não definida.");
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

                            // Chama a rota de processamento de pagamento direto
                            const { data } = await api.post('/checkout/process_payment', payload);

                            if (data.status === 'APPROVED') {
                                setPaymentStatus('approved');
                                setTimeout(() => onSuccess(), 2000); 
                            } else if (data.status === 'PENDING' && data.qrCodeBase64) {
                                // Caso seja Pix, mostra a tela de QR Code
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
            if (container) container.innerHTML = ''; 

            await bricksBuilder.create("payment", "paymentBrick_container", settings);
        };

        const timer = setTimeout(loadBrick, 500);
        return () => clearTimeout(timer);
    }, [user]);

    // Função de teste para desenvolvedores (bypass)
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
                    {/* ... (Todo o conteúdo da Coluna Esquerda: Proposta de Valor e Preço) ... */}
                    {/* *** O BOTÃO DE REDIRECIONAMENTO FOI REMOVIDO DESTA COLUNA *** */}
                    
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
                    
                    {/* ... (Estados de Loading, Erro, Sucesso e PIX) ... */}

                    {/* Brick Container */}
                    <div className="p-6 md:p-12 flex-1 overflow-y-auto custom-scrollbar">
                        <div id="paymentBrick_container"></div> {/* <-- O formulário integrado aparece aqui */}
                    </div>
                </div>

            </div>
        </div>
    );
};